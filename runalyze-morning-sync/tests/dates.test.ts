import { describe, expect, it } from "vitest";

import { expandTemplate, yesterday } from "../src/dates.js";

describe("date helpers", () => {
  it("computes yesterday in ISO format", () => {
    expect(yesterday(new Date("2026-04-28T10:00:00Z"))).toBe("2026-04-27");
  });

  it("expands endpoint templates", () => {
    expect(expandTemplate("/activities?from={from}&to={to}&date={date}", "2026-04-27")).toBe(
      "/activities?from=2026-04-27&to=2026-04-27&date=2026-04-27"
    );
  });
});
