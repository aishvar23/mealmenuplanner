/**
 * Provider Workspace service layer (Meal Provider Workspace, contract 03 § 8).
 * The barrel the `app/api/providers/*` route handlers import from.
 */
export {
  completeProviderOnboarding,
  createProviderDraft,
  getOwnerDraftProvider,
  getProvider,
  updateProvider,
} from "./onboarding";
export {
  isValidTimeZone,
  validateProviderName,
  validateProviderUpdate,
  type ProviderUpdatePatch,
} from "./validation";
