import {createApiGuard} from './api-guard';
import {requireMember} from './auth';
import {transaction} from './database';
export const withApi=createApiGuard(requireMember,transaction);
