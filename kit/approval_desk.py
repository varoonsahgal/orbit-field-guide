"""ORBIT Field Academy - Mission 08 - the approval desk (human in the loop).

Runs a mission on your commander agent, streams what the crew is doing, and stops
whenever the commander calls request_human_approval. You read the exact plan and
type APPROVE or REJECT. Your answer goes back to the agent as the tool result.

    python3 approval_desk.py MY_ID                       # run the storm mission
    python3 approval_desk.py MY_ID "your own mission text"
    python3 approval_desk.py MY_ID --system-prompt reckless.txt "..."   # Phase 6 drill
"""
import json
import sys
import textwrap
import uuid

import boto3
from botocore.config import Config

REGION = "us-west-2"
STORM = ("Storm alert. An atmospheric river is forecast to hit Portland. Intel sources: "
         "https://varoonsahgal.github.io/orbit-field-guide/intel/weather-desk.html and "
         "https://varoonsahgal.github.io/orbit-field-guide/intel/carrier-status.html. "
         "The COO wants to move to Reno (RNO) the pending Portland (PDX) orders that Reno can actually fill for Nov 5-7. "
         "Work out the best reroute_orders call, request approval for it, execute only what is approved, "
         "and finish with a decision brief that says what we cannot cover.")
C = {"dim": "\033[2m", "b": "\033[1m", "cyan": "\033[36m", "yel": "\033[33m", "grn": "\033[32m", "red": "\033[31m", "x": "\033[0m"}


def find_commander(my_id):
    ctl = boto3.client("bedrock-agentcore-control", region_name=REGION)
    name = f"orbit_{my_id}_commander"
    for page in ctl.get_paginator("list_harnesses").paginate():
        for h in page["harnesses"]:
            if h["harnessName"] == name:
                return h["arn"]
    sys.exit(f"No harness named {name} in {REGION}. Check your MY_ID.")


def stream(response):
    """Print the agent's progress. Return (stop_reason, pending inline tool calls)."""
    tools, current, stop = [], None, None
    for event in response["stream"]:
        if "contentBlockStart" in event:
            start = event["contentBlockStart"].get("start", {})
            if "toolUse" in start:
                current = {"name": start["toolUse"]["name"], "id": start["toolUse"]["toolUseId"], "input": ""}
                tools.append(current)
                short = current["name"].split("___")[-1]
                print(f"\n{C['cyan']}📡 commander → {short}{C['x']}", flush=True)
        elif "contentBlockDelta" in event:
            delta = event["contentBlockDelta"]["delta"]
            if "text" in delta:
                print(delta["text"], end="", flush=True)
            elif "toolUse" in delta and current:
                current["input"] += delta["toolUse"].get("input", "")
            elif "toolResult" in delta:
                print(f"{C['dim']}   ↳ result received{C['x']}", flush=True)
        elif "messageStop" in event:
            stop = event["messageStop"].get("stopReason")
        elif "metadata" in event:
            u = event["metadata"].get("usage", {})
            print(f"\n{C['dim']}   [tokens in {u.get('inputTokens')} / out {u.get('outputTokens')}]{C['x']}", flush=True)
        elif any(k.endswith(("Exception", "Error")) for k in event):
            print(f"\n{C['red']}{event}{C['x']}")
    pending = [t for t in tools if t["name"] == "request_human_approval"]
    return stop, pending


def ask_human(call):
    req = json.loads(call["input"] or "{}")
    print(f"\n\n{C['yel']}{'═' * 70}\n  ✋  APPROVAL REQUIRED   (toolUseId {call['id']})\n{'═' * 70}{C['x']}")
    print(f"{C['b']}Action:{C['x']}     {req.get('action')}")
    print(f"{C['b']}Parameters:{C['x']}")
    for k, v in (req.get("parameters") or {}).items():
        print(f"   {k:<22} {v}")
    print(f"{C['b']}Justification:{C['x']}")
    print(textwrap.indent(textwrap.fill(str(req.get("justification", "")), 90), "   "))
    print(f"{C['yel']}{'═' * 70}{C['x']}")
    while True:
        answer = input("Type APPROVE, or REJECT followed by a reason: ").strip()
        if answer.upper() == "APPROVE":
            return "APPROVED by the duty manager. Execute exactly the parameters above, nothing else."
        if answer.upper().startswith("REJECT"):
            return "REJECTED by the duty manager. Reason: " + (answer[6:].strip() or "none given") + ". Do not execute it."


def main():
    args = sys.argv[1:]
    if not args:
        sys.exit(__doc__)
    my_id, system_prompt = args.pop(0), None
    if args and args[0] == "--system-prompt":
        args.pop(0)
        system_prompt = open(args.pop(0)).read()
    mission = args[0] if args else STORM

    agentcore = boto3.client("bedrock-agentcore", region_name=REGION, config=Config(read_timeout=900))
    harness_arn = find_commander(my_id)
    session = f"desk-{my_id}-{uuid.uuid4()}"
    extra = {"systemPrompt": [{"text": system_prompt}]} if system_prompt else {}
    print(f"{C['b']}🛰️  ORBIT approval desk{C['x']}  harness {harness_arn.split('/')[-1]}  session {session}\n")
    print(f"{C['dim']}Mission: {mission}{C['x']}\n")

    response = agentcore.invoke_harness(harnessArn=harness_arn, runtimeSessionId=session,
                                        messages=[{"role": "user", "content": [{"text": mission}]}], **extra)
    stop, pending = stream(response)
    while stop == "tool_use" and pending:
        decision = ask_human(pending[0])
        print(f"{C['grn'] if decision.startswith('APPROVED') else C['red']}{decision}{C['x']}")
        response = agentcore.invoke_harness(
            harnessArn=harness_arn, runtimeSessionId=session, **extra,
            messages=[{"role": "user", "content": [{"toolResult": {"toolUseId": pending[0]["id"], "status": "success",
                                                                    "content": [{"text": decision}]}}]}])
        stop, pending = stream(response)
    print(f"\n\n{C['dim']}Session {session} finished with stop reason: {stop}{C['x']}")


if __name__ == "__main__":
    main()
