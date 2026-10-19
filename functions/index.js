const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { getMessaging } = require('firebase-admin/messaging');
const { onDocumentUpdated } = require('firebase-functions/v2/firestore');
const { onSchedule } = require('firebase-functions/v2/scheduler');

initializeApp();

const db = getFirestore();
const region = 'asia-southeast1';
const defaultPreferences = {
  requestUpdatesEnabled: true,
  returnRemindersEnabled: true,
  pushNotificationsEnabled: true,
};

function preferencesFor(account) {
  return { ...defaultPreferences, ...(account.notificationPreferences || {}) };
}

function dateInManila(date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function itemTitle(loan) {
  return loan.name || 'your requested item';
}

async function notifyBorrower({
  borrowerUid,
  notificationId,
  title,
  message,
  type,
  loanId,
  preferenceKey,
}) {
  if (typeof borrowerUid !== 'string' || !borrowerUid) return;

  const accountRef = db.collection('accounts').doc(borrowerUid);
  const accountSnapshot = await accountRef.get();
  if (!accountSnapshot.exists) return;

  const preferences = preferencesFor(accountSnapshot.data());
  if (!preferences[preferenceKey]) return;

  const notificationRef = accountRef.collection('notifications').doc(notificationId);
  const created = await db.runTransaction(async (transaction) => {
    const existing = await transaction.get(notificationRef);
    if (existing.exists) return false;
    transaction.create(notificationRef, {
      id: notificationId,
      loanId,
      type,
      title,
      message,
      isRead: false,
      timestamp: FieldValue.serverTimestamp(),
    });
    return true;
  });
  if (!created) return;

  let pushSent = false;
  if (preferences.pushNotificationsEnabled) {
    const deviceSnapshots = await accountRef.collection('devices').get();
    const devices = deviceSnapshots.docs
      .map((document) => ({ ref: document.ref, token: document.data().token }))
      .filter((device) => typeof device.token === 'string' && device.token);

    for (let offset = 0; offset < devices.length; offset += 500) {
      const batch = devices.slice(offset, offset + 500);
      const response = await getMessaging().sendEachForMulticast({
        tokens: batch.map((device) => device.token),
        notification: { title, body: message },
        data: { notificationId, type, loanId },
        android: {
          priority: 'high',
          notification: { channelId: 'lendy_alerts' },
        },
      });
      pushSent = pushSent || response.successCount > 0;

      const invalidTokenCodes = new Set([
        'messaging/invalid-registration-token',
        'messaging/registration-token-not-registered',
      ]);
      await Promise.all(
        response.responses.map((result, index) => {
          if (result.success || !invalidTokenCodes.has(result.error?.code)) {
            return Promise.resolve();
          }
          return batch[index].ref.delete();
        }),
      );
    }
  }

  await notificationRef.update({ pushSent });
}

exports.notifyLoanStatus = onDocumentUpdated(
  { document: 'loans/{loanId}', region },
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!before || !after || before.status !== 'pending') return;
    if (after.status !== 'approved' && after.status !== 'rejected') return;

    const title =
      after.status === 'approved' ? 'Request approved' : 'Request rejected';
    const message =
      after.status === 'approved'
        ? `${itemTitle(after)} has been approved.`
        : `${itemTitle(after)} was not approved.`;

    await notifyBorrower({
      borrowerUid: after.borrowerUid,
      notificationId: `${event.params.loanId}_${after.status}`,
      title,
      message,
      type: after.status,
      loanId: event.params.loanId,
      preferenceKey: 'requestUpdatesEnabled',
    });
  },
);

exports.sendLoanReminders = onSchedule(
  {
    schedule: '0 9 * * *',
    timeZone: 'Asia/Manila',
    region,
  },
  async () => {
    const today = dateInManila(new Date());
    const tomorrowDate = new Date(`${today}T00:00:00.000Z`);
    tomorrowDate.setUTCDate(tomorrowDate.getUTCDate() + 1);
    const tomorrow = tomorrowDate.toISOString().slice(0, 10);
    const activeLoans = await db
      .collection('loans')
      .where('status', '==', 'approved')
      .get();

    await Promise.all(
      activeLoans.docs.map(async (document) => {
        const loan = document.data();
        if (typeof loan.end !== 'string') return;

        if (loan.end === tomorrow) {
          await notifyBorrower({
            borrowerUid: loan.borrowerUid,
            notificationId: `${document.id}_due_${tomorrow}`,
            title: 'Return due tomorrow',
            message: `${itemTitle(loan)} is due tomorrow. Please return it on time.`,
            type: 'due_reminder',
            loanId: document.id,
            preferenceKey: 'returnRemindersEnabled',
          });
        } else if (loan.end < today) {
          await notifyBorrower({
            borrowerUid: loan.borrowerUid,
            notificationId: `${document.id}_overdue_${today}`,
            title: 'Item overdue',
            message: `${itemTitle(loan)} was due ${loan.end} and is overdue. Please return it as soon as possible.`,
            type: 'overdue',
            loanId: document.id,
            preferenceKey: 'returnRemindersEnabled',
          });
        }
      }),
    );
  },
);
