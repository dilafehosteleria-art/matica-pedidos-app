export type ConfigFlowGroup = {
  key: string;
  dependsOn?: {
    key: string;
    values: string[];
  };
};

export function isConfigFlowGroupActive(group: ConfigFlowGroup, singleValues: Record<string, string>) {
  if (!group.dependsOn) {
    return true;
  }

  return group.dependsOn.values.includes(singleValues[group.dependsOn.key]);
}

export function activeConfigFlowGroups<ConfigGroup extends ConfigFlowGroup>(
  groups: ConfigGroup[],
  singleValues: Record<string, string>
) {
  return groups.filter((group) => isConfigFlowGroupActive(group, singleValues));
}

export function nextConfigFlowStepIndex(
  groups: ConfigFlowGroup[],
  currentGroupKey: string,
  nextSingleValues: Record<string, string>
) {
  const activeGroups = activeConfigFlowGroups(groups, nextSingleValues);
  const currentIndex = activeGroups.findIndex((group) => group.key === currentGroupKey);

  if (currentIndex < 0) {
    return 0;
  }

  return Math.min(currentIndex + 1, activeGroups.length - 1);
}
