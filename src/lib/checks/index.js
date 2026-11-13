import { securityChecks } from './security.js';
import { channelChecks } from './channels.js';
import { automodChecks } from './automod.js';
import { roleChecks } from './roles.js';

/** Ordem em que as verificações correm. */
export const checks = [
  ...securityChecks,
  ...channelChecks,
  ...automodChecks,
  ...roleChecks,
];

export const areas = ['security', 'channels', 'automod', 'roles'];
