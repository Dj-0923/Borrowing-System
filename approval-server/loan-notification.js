"use strict";

function buildLoanNotification(loanId, loan) {
  if (typeof loanId !== "string" || !loanId || !loan) return null;

  const itemName = loan.name || "Your requested item";
  if (
    loan.status === "approved" &&
    loan.returnVerificationStatus === "rejected"
  ) {
    const eventId = loan.returnVerifiedAt ?? loan.updatedAt ?? "unknown";
    return {
      notificationId: `${loanId}_return_rejected_${String(eventId)}`,
      title: "Return needs attention",
      message: loan.returnRejectionReason
        ? `${itemName} return was not approved: ${loan.returnRejectionReason}`
        : `${itemName} return was not approved. Please review and resubmit.`,
      type: "return_rejected",
      loanId,
    };
  }

  if (loan.status === "returned") {
    return {
      notificationId: `${loanId}_returned`,
      title: "Item return confirmed",
      message: `${itemName} has been marked as returned. Thank you.`,
      type: "returned",
      loanId,
    };
  }

  if (loan.status === "approved" || loan.status === "rejected") {
    const approved = loan.status === "approved";
    return {
      notificationId: `${loanId}_${loan.status}`,
      title: approved ? "Request approved" : "Request rejected",
      message: approved
        ? `${itemName} has been approved.`
        : `${itemName} was not approved.`,
      type: loan.status,
      loanId,
    };
  }

  return null;
}

module.exports = { buildLoanNotification };
