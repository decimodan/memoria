import type { Session } from "./contracts";
export const example: Session = {
  transcript:
    "Customer: I've been thinking about asking for a transfer to the platform team. I don't know. Maybe it's just a bad month.\nCoach: What would tell you it's more than a bad month?\nCustomer: If I still feel like this in October, I guess. I haven't told anyone. Not sure I want to yet.\nCoach: What would help you decide?\nCustomer: Talking to someone on platform. Low-key.",
  context: [{ date: null, text: "Senior engineer, 6 years at the company" }],
  summary:
    "Customer has decided to request a transfer to the platform team and will reach out to them.",
  facts: ["Requesting transfer to platform team", "Unhappy in current team"],
  risk: { status: "none", signals: [] },
};
