"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { isAllowedApiRequest } = require("./request-origin");

const allowedOrigins = new Set(["https://borrowing-system-lendy.web.app"]);

test("allows local browser origins for the authenticated borrower endpoint", () => {
  for (const origin of [
    "http://localhost:49864",
    "http://127.0.0.1:8080",
    "http://[::1]:3000",
  ]) {
    assert.equal(
      isAllowedApiRequest({
        origin,
        method: "OPTIONS",
        pathname: "/borrower-assistant",
        allowedOrigins,
      }),
      true,
    );
  }
});

test("allows native borrower POSTs without an Origin header", () => {
  assert.equal(
    isAllowedApiRequest({
      origin: undefined,
      method: "POST",
      pathname: "/borrower-assistant",
      allowedOrigins,
    }),
    true,
  );
});

test("does not allow local origins to access admin endpoints", () => {
  assert.equal(
    isAllowedApiRequest({
      origin: "http://localhost:49864",
      method: "POST",
      pathname: "/assistant",
      allowedOrigins,
    }),
    false,
  );
});

test("does not allow missing origins for protected admin endpoints", () => {
  assert.equal(
    isAllowedApiRequest({
      origin: undefined,
      method: "POST",
      pathname: "/assistant",
      allowedOrigins,
    }),
    false,
  );
});

test("continues to allow the configured production app origin", () => {
  assert.equal(
    isAllowedApiRequest({
      origin: "https://borrowing-system-lendy.web.app",
      method: "OPTIONS",
      pathname: "/borrower-assistant",
      allowedOrigins,
    }),
    true,
  );
});
