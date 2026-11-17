export { checkNotebook, fixMechanical, summarize } from "./checker.js";
export {
  addInstruction,
  createNotebook,
  diffSkills,
  findProjectRoot,
  installMarkerFile,
  installSkills,
  inspectProject,
  isSupportedLocation,
  loadPackageData,
  notebookDirectory,
  preflightInstall,
  readInstallMarker,
  readInstallState,
  readSkillMarker,
  SkillConflictError,
  supportedLocations,
  writeInstallMarker,
} from "./installer.js";

export { buildInstructionChoices, buildLocationChoices, createUi, formatInstallResult } from "./prompts.js";