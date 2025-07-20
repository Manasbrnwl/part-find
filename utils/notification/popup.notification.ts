/**
 * Format a reminder notification
 * @param {object} reminder - Reminder object with populated medicine
 * @returns {object} - Formatted notification content
 */
exports.formatReminderNotification = (reminder: any) => {
  const medicineName = reminder.medicine?.name || "your medicine";
  const dosage = reminder.medicine?.dosage || "prescribed dose";

  return {
    title: `Medicine Reminder: ${medicineName}`,
    body: `It's time to take ${dosage} of ${medicineName}`,
    data: {
      reminderId: reminder._id,
      medicineId: reminder.medicine?._id,
      time: reminder.time
    }
  };
};
