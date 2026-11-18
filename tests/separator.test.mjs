// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import { Separator } from "../src/components/ui/separator.tsx";

afterEach(cleanup);

test("separator keeps its base and caller classes for each orientation", () => {
  const { rerender } = render(React.createElement(Separator, { className: "caller-class" }));
  let separator = screen.getByRole("separator");
  expect(separator.classList.contains("bg-border")).toBe(true);
  expect(separator.classList.contains("caller-class")).toBe(true);

  const className = (state) => `custom-${state.orientation}`;
  rerender(React.createElement(Separator, { className }));
  separator = screen.getByRole("separator");
  expect(separator.classList.contains("bg-border")).toBe(true);
  expect(separator.classList.contains("custom-horizontal")).toBe(true);

  rerender(React.createElement(Separator, { orientation: "vertical", className }));
  separator = screen.getByRole("separator");
  expect(separator.getAttribute("aria-orientation")).toBe("vertical");
  expect(separator.classList.contains("bg-border")).toBe(true);
  expect(separator.classList.contains("custom-vertical")).toBe(true);
});
