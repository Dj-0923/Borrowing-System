"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { buildLoanNotification } = require("./loan-notification");

test("builds stable notifications for approved and rejected requests", () => {
  assert.deepEqual(
    buildLoanNotification("loan-1", { name: "Camera", status: "approved" }),
    {
      notificationId: "loan-1_approved",
      title: "Request approved",
      message: "Camera has been approved. Do not take borrowed items home. Borrowers are responsible for repair or replacement costs for lost or damaged items.",
      type: "approved",
      loanId: "loan-1",
    },
  );
  assert.deepEqual(
    buildLoanNotification("loan-2", { name: "Projector", status: "rejected" }),
    {
      notificationId: "loan-2_rejected",
      title: "Request rejected",
      message: "Projector was not approved.",
      type: "rejected",
      loanId: "loan-2",
    },
  );
});

test("uses the return verification event for rejected-return notification IDs", () => {
  assert.deepEqual(
    buildLoanNotification("loan-3", {
      name: "Camera",
      status: "approved",
      returnVerificationStatus: "rejected",
      returnVerifiedAt: 12345,
      returnRejectionReason: "The item is damaged.",
    }),
    {
      notificationId: "loan-3_return_rejected_12345",
      title: "Return needs attention",
      message: "Camera return was not approved: The item is damaged.",
      type: "return_rejected",
      loanId: "loan-3",
    },
  );
});

test("builds a return-confirmed notification and ignores non-final states", () => {
  assert.deepEqual(
    buildLoanNotification("loan-4", { status: "returned" }),
    {
      notificationId: "loan-4_returned",
      title: "Item return confirmed",
      message: "Your requested item has been marked as returned. Thank you.",
      type: "returned",
      loanId: "loan-4",
    },
  );
  assert.equal(buildLoanNotification("loan-5", { status: "return_pending" }), null);
});
