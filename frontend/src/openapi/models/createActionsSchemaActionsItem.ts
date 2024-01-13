/**
 * Generated by Orval
 * Do not edit manually.
 * See `gen:api` script in package.json
 */
import type { CreateActionsSchemaActionsItemParams } from './createActionsSchemaActionsItemParams';

export type CreateActionsSchemaActionsItem = {
    /** The name of the action to execute */
    action: string;
    /** A map of parameters to pass to the action */
    params?: CreateActionsSchemaActionsItemParams;
    /** The order in which the action should be executed */
    sortOrder: number;
};
