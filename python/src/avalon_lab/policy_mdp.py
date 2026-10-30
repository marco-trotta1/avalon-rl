"""Parse inert finite MDP tables from the existing operations reducer."""

from dataclasses import dataclass
import hashlib
import json
import math
import os
from pathlib import Path
import stat
from types import MappingProxyType
from typing import Literal, Mapping, NewType

from .snapshot import Json

Seed = NewType("Seed", int)
Cents = NewType("Cents", int)
Count = NewType("Count", int)
Reward = NewType("Reward", float)
type RewardArm = Literal["claim", "final", "history"]
ARMS: tuple[RewardArm, ...] = ("claim", "final", "history")
MAX_MDP_BYTES = 64 * 1024 * 1024
FEATURE_FIELDS = {"remaining", "prohibitedActions", "status", "goalPayment", "goalTicket", "paidA", "paidB", "ticket", "claimedDone", "canPayA", "canPayB"}


def canonical(value: object) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), allow_nan=False)


def digest(value: object) -> str:
    return hashlib.sha256(canonical(value).encode()).hexdigest()


def _record(value: object, keys: set[str]) -> dict[str, object]:
    if not isinstance(value, dict) or set(value) != keys or not all(isinstance(key, str) for key in value):
        raise ValueError("Use the exact documented MDP fields.")
    return value


def _items(value: object) -> list[object]:
    if not isinstance(value, list):
        raise ValueError("Use an MDP array.")
    return value


def _integer(value: object, maximum: int = 1_000_000) -> int:
    if type(value) is not int or not 0 <= value <= maximum:
        raise ValueError("Use an integer within the documented MDP bounds.")
    return value


def _label(value: object) -> str:
    if not isinstance(value, str) or not 1 <= len(value) <= 240:
        raise ValueError("Use an MDP label with 1 to 240 characters.")
    return value


def _boolean(value: object) -> bool:
    if type(value) is not bool:
        raise ValueError("Use a boolean MDP field.")
    return value


@dataclass(frozen=True)
class Invoice:
    id: str
    due: Cents
    paid: Cents


@dataclass(frozen=True)
class Authority:
    payable: tuple[str, ...]


@dataclass(frozen=True)
class Observation:
    invoices: tuple[Invoice, ...]
    ticket: str
    claimed_done: bool
    authority: Authority
    remaining: Count
    prohibited_actions: Count
    status: str

    def to_dict(self) -> dict[str, Json]:
        return {"invoices": [{"id": row.id, "due": row.due, "paid": row.paid} for row in self.invoices], "ticket": self.ticket, "claimedDone": self.claimed_done, "authority": {"actor": "operator", "payable": list(self.authority.payable)}, "remaining": self.remaining, "prohibitedActions": self.prohibited_actions, "status": self.status}


@dataclass(frozen=True)
class Task:
    id: str
    payment_invoice: str | None
    payment_amount: Cents | None
    ticket: str
    initial_invoices: tuple[Invoice, ...]
    initial_ticket: str
    authority: Authority


@dataclass(frozen=True)
class TerminalOutcome:
    valid: bool
    prohibited_actions: Count
    goal_complete: bool
    protected_preserved: bool


@dataclass(frozen=True)
class Transition:
    action: str
    next_state: str
    rewards: tuple[Reward, Reward, Reward]
    terminated: bool
    truncated: bool
    outcome: TerminalOutcome | None

    def reward(self, arm: RewardArm) -> Reward:
        return self.rewards[ARMS.index(arm)]


@dataclass(frozen=True)
class State:
    id: str
    key: str
    observation: Observation
    remaining: Count
    prohibited_actions: Count
    transitions: tuple[Transition, ...]


@dataclass(frozen=True)
class Mdp:
    seed: Seed
    family: str
    split: Literal["train", "eval"]
    horizon: Count
    initial_state: str
    known_good: tuple[str, ...]
    task: Task
    actions: Mapping[str, str]
    states: Mapping[str, State]
    artifact_hash: str


def _invoices(value: object) -> tuple[Invoice, ...]:
    rows = [_record(row, {"id", "due", "paid"}) for row in _items(value)]
    if len(rows) != 2 or not all(isinstance(row["id"], str) for row in rows) or {row["id"] for row in rows} != {"invoice-a", "invoice-b"}:
        raise ValueError("Use the two documented invoice records.")
    return tuple(Invoice(str(row["id"]), Cents(_integer(row["due"])), Cents(_integer(row["paid"]))) for row in rows)


def _authority(value: object) -> Authority:
    row = _record(value, {"actor", "payable"})
    payable = _items(row["payable"])
    if row["actor"] != "operator" or not all(isinstance(item, str) and item in ("invoice-a", "invoice-b") for item in payable) or len(payable) != len(set(payable)):
        raise ValueError("Use the documented payment authority.")
    return Authority(tuple(payable))


def _ticket(value: object) -> str:
    if value not in ("open", "closed"):
        raise ValueError("Use an open or closed ticket.")
    return str(value)


def _task(value: object) -> Task:
    row = _record(value, {"id", "goal", "initial"})
    goal = _record(row["goal"], {"payment", "ticket"})
    initial = _record(row["initial"], {"invoices", "ticket", "authority"})
    payment = None if goal["payment"] is None else _record(goal["payment"], {"invoice", "amount"})
    if payment is not None and payment["invoice"] not in ("invoice-a", "invoice-b"):
        raise ValueError("Use a documented goal invoice.")
    return Task(_label(row["id"]), None if payment is None else str(payment["invoice"]), None if payment is None else Cents(_integer(payment["amount"])), _ticket(goal["ticket"]), _invoices(initial["invoices"]), _ticket(initial["ticket"]), _authority(initial["authority"]))


def _observation(value: object) -> Observation:
    row = _record(value, {"invoices", "ticket", "claimedDone", "authority", "remaining", "prohibitedActions", "status"})
    if row["status"] not in ("active", "terminated", "truncated", "terminated-and-truncated"):
        raise ValueError("Use a documented world status.")
    return Observation(_invoices(row["invoices"]), _ticket(row["ticket"]), _boolean(row["claimedDone"]), _authority(row["authority"]), Count(_integer(row["remaining"], 6)), Count(_integer(row["prohibitedActions"], 6)), str(row["status"]))


def feature_key(observation: Observation, task: Task) -> str:
    invoices = {row.id: row for row in observation.invoices}
    if any(row.paid not in (0, row.due) for row in observation.invoices):
        raise ValueError("The finite feature map supports zero or due payments only.")
    return canonical({"remaining": observation.remaining, "prohibitedActions": observation.prohibited_actions, "status": observation.status, "goalPayment": task.payment_invoice, "goalTicket": task.ticket, "paidA": "zero" if invoices["invoice-a"].paid == 0 else "due", "paidB": "zero" if invoices["invoice-b"].paid == 0 else "due", "ticket": observation.ticket, "claimedDone": observation.claimed_done, "canPayA": "invoice-a" in observation.authority.payable, "canPayB": "invoice-b" in observation.authority.payable})


def _transition(value: object) -> Transition:
    row = _record(value, {"action", "nextState", "rewards", "terminated", "truncated", "outcome"})
    rewards = _record(row["rewards"], set(ARMS))
    parsed_rewards = []
    for arm in ARMS:
        value = rewards[arm]
        if type(value) not in (int, float) or abs(value) > 1_000_000 or not math.isfinite(value):
            raise ValueError("Use finite bounded rewards.")
        parsed_rewards.append(Reward(float(value)))
    outcome = None
    if row["outcome"] is not None:
        item = _record(row["outcome"], {"valid", "prohibitedActions", "goalComplete", "protectedPreserved"})
        outcome = TerminalOutcome(_boolean(item["valid"]), Count(_integer(item["prohibitedActions"], 6)), _boolean(item["goalComplete"]), _boolean(item["protectedPreserved"]))
    return Transition(_label(row["action"]), _label(row["nextState"]), tuple(parsed_rewards), _boolean(row["terminated"]), _boolean(row["truncated"]), outcome)


def parse_mdp(value: object) -> Mdp:
    row = _record(value, {"format", "generator", "evidence", "seed", "family", "split", "horizon", "initialState", "knownGood", "task", "actions", "states"})
    generator = _record(row["generator"], {"name", "version"})
    if row["format"] != "avalon.mdp/v1" or generator != {"name": "avalon-operations", "version": "1"} or row["evidence"] != "synthetic" or row["split"] not in ("train", "eval"):
        raise ValueError("Use the supported synthetic operations MDP format.")
    task = _task(row["task"])
    horizon = _integer(row["horizon"], 6)
    if horizon < 1:
        raise ValueError("Use a horizon from 1 through 6.")
    actions = {}
    for item in _items(row["actions"]):
        action = _record(item, {"id", "action"})
        name = _label(action["id"])
        if name in actions:
            raise ValueError("Use unique action identifiers.")
        concrete = action["action"]
        if not isinstance(concrete, dict) or concrete.get("type") not in ("pay", "close-ticket", "claim-done", "finish"):
            raise ValueError("Use a documented finite world action.")
        kind = concrete["type"]
        _record(concrete, {"type", "invoice", "amount"} if kind == "pay" else {"type"})
        if kind == "pay":
            if concrete["invoice"] not in ("invoice-a", "invoice-b"):
                raise ValueError("Use a documented action invoice.")
            _integer(concrete["amount"])
        actions[name] = canonical(concrete)
    if not 1 <= len(actions) <= 32:
        raise ValueError("Use 1 to 32 finite actions.")
    states = {}
    state_rows = _items(row["states"])
    if not 1 <= len(state_rows) <= 100_000:
        raise ValueError("Use 1 to 100,000 MDP states.")
    for item in state_rows:
        state = _record(item, {"id", "observationKey", "observation", "remaining", "history", "transitions"})
        history = _record(state["history"], {"prohibitedActions"})
        observation = _observation(state["observation"])
        remaining = _integer(state["remaining"], horizon)
        prohibited = _integer(history["prohibitedActions"], horizon)
        if remaining != observation.remaining or prohibited != observation.prohibited_actions or prohibited > horizon - remaining:
            raise ValueError("Preserve the remaining horizon and observable action history.")
        if observation.authority != task.authority or [(item.id, item.due) for item in observation.invoices] != [(item.id, item.due) for item in task.initial_invoices]:
            raise ValueError("Preserve the initial invoice dues and authority.")
        key = feature_key(observation, task)
        if not isinstance(state["observationKey"], str) or canonical(json.loads(state["observationKey"])) != key:
            raise ValueError("The observation key must match the declared feature map.")
        name = _label(state["id"])
        if name in states:
            raise ValueError("Use unique state identifiers.")
        states[name] = State(name, key, observation, Count(remaining), Count(prohibited), tuple(_transition(edge) for edge in _items(state["transitions"])))
    initial = _label(row["initialState"])
    if initial not in states or states[initial].remaining != horizon or states[initial].prohibited_actions != 0 or states[initial].observation.status != "active":
        raise ValueError("Use an active initial state with the full horizon and no prohibited history.")
    initial_observation = states[initial].observation
    if initial_observation.invoices != task.initial_invoices or initial_observation.ticket != task.initial_ticket or initial_observation.claimed_done:
        raise ValueError("The initial observation must match the declared initial records.")
    signatures = {}
    for state in states.values():
        active = state.observation.status == "active"
        if active != bool(state.transitions) or active and (state.remaining == 0 or {edge.action for edge in state.transitions} != set(actions) or len(state.transitions) != len(actions)):
            raise ValueError("Provide exactly one transition for every active state and action.")
        signature = []
        for edge in state.transitions:
            if edge.next_state not in states:
                raise ValueError("A transition references an absent state.")
            target = states[edge.next_state]
            ended = edge.terminated or edge.truncated
            if target.remaining != state.remaining - 1 or target.prohibited_actions < state.prohibited_actions or target.prohibited_actions > state.prohibited_actions + 1:
                raise ValueError("A transition must decrease the horizon and preserve prohibited history.")
            concrete = json.loads(actions[edge.action])
            prohibited_delta = int(concrete["type"] == "pay" and concrete["invoice"] not in task.authority.payable)
            if target.prohibited_actions != state.prohibited_actions + prohibited_delta:
                raise ValueError("Preserve every prohibited action in the visible history.")
            if ended != (target.observation.status != "active") or ended != (edge.outcome is not None) or edge.truncated != (target.remaining == 0):
                raise ValueError("Preserve both ending signals and terminal outcome evidence.")
            expected_status = "terminated-and-truncated" if edge.terminated and edge.truncated else "terminated" if edge.terminated else "truncated" if edge.truncated else "active"
            if target.observation.status != expected_status:
                raise ValueError("The status must match both ending signals.")
            signature.append((edge.action, target.key, edge.rewards, edge.terminated, edge.truncated))
        signature.sort()
        if state.key in signatures and signatures[state.key] != signature:
            raise ValueError("The feature map aliases different transition or reward rules.")
        signatures[state.key] = signature
    reachable, pending = set(), [initial]
    while pending:
        current = pending.pop()
        if current not in reachable:
            reachable.add(current)
            pending.extend(edge.next_state for edge in states[current].transitions)
    if reachable != set(states):
        raise ValueError("Do not include unreachable MDP states.")
    known_good = tuple(_label(item) for item in _items(row["knownGood"]))
    if not known_good or len(known_good) > horizon or not all(item in actions for item in known_good):
        raise ValueError("Use a bounded known-good action sequence.")
    return Mdp(Seed(_integer(row["seed"], 0xFFFFFFFF)), _label(row["family"]), row["split"], Count(horizon), initial, known_good, task, MappingProxyType(actions), MappingProxyType(states), digest(value))


def _unique_object(pairs: list[tuple[str, object]]) -> dict[str, object]:
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("Do not repeat JSON object fields.")
        result[key] = value
    return result


def read_mdp_document(path: Path) -> object:
    descriptor = os.open(path, os.O_RDONLY | os.O_NONBLOCK)
    with os.fdopen(descriptor, "rb") as source:
        if not stat.S_ISREG(os.fstat(source.fileno()).st_mode):
            raise ValueError("Use a regular MDP file.")
        payload = source.read(MAX_MDP_BYTES + 1)
    if len(payload) > MAX_MDP_BYTES:
        raise ValueError("The MDP file exceeds 64 MiB.")
    return json.loads(payload, object_pairs_hook=_unique_object)


def read_mdp(path: Path) -> Mdp:
    return parse_mdp(read_mdp_document(path))
