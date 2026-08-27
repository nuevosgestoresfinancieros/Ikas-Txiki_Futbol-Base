export const canSendCommunication = (state) => ["pending", "failed"].includes(state);
export const isCommunicationSending = (communicationId, sendingId) => communicationId === sendingId;
export const communicationSendConfirmation = (t, recipientCount) => `${t("confirmSendCommunication")} ${recipientCount} ${t("recipients")}`;
