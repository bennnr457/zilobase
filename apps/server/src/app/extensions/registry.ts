import type { EditionExtensionOptions } from "../../shared/contracts/edition";

const appEditionExtensions = new WeakMap<object, EditionExtensionOptions["editionExtension"]>();

export function registerAppEditionExtension(
  app: object,
  editionExtension: EditionExtensionOptions["editionExtension"],
) {
  appEditionExtensions.set(app, editionExtension);
}

export function getAppEditionExtension(app: object) {
  return appEditionExtensions.get(app);
}
