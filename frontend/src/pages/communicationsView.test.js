import { translations } from "../i18n";
import { canSendCommunication, communicationSendConfirmation, isCommunicationSending } from "./communicationsView";

test("muestra Enviar solo para comunicaciones pending o failed", () => {
  expect(canSendCommunication("pending")).toBe(true);
  expect(canSendCommunication("failed")).toBe(true);
  expect(canSendCommunication("sending")).toBe(false);
  expect(canSendCommunication("sent")).toBe(false);
});

test("la confirmación se basa en send-preview antes del envío", () => {
  const t = (key) => translations.es[key];
  expect(communicationSendConfirmation(t, 3)).toBe("Se enviará esta comunicación a 3 destinatarios. ¿Quieres continuar?");
});

test("el estado Enviando bloquea solo el botón de esa comunicación", () => {
  expect(isCommunicationSending("communication-a", "communication-a")).toBe(true);
  expect(isCommunicationSending("communication-b", "communication-a")).toBe(false);
});

test("los textos de enviar, éxito, error y reintento están disponibles en ES y EU", () => {
  ["send", "sending", "confirmSendCommunication", "communicationSent", "communicationSendError", "communicationAlreadySent"].forEach((key) => {
    expect(translations.es[key]).toBeTruthy();
    expect(translations.eu[key]).toBeTruthy();
  });
  expect(canSendCommunication("failed")).toBe(true);
});
