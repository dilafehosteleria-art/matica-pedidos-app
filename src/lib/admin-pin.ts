export function isAdminPinValid(requestPin: string, configuredPin: string | undefined) {
  return Boolean(configuredPin && requestPin === configuredPin);
}
