/** Netlify build context from netlify.toml — distinguishes production, preview, and non-prod deploys. */
export const wingsDeployContext = import.meta.env.VITE_WINGS_DEPLOY_CONTEXT ?? 'unknown';
export const wingsDataMode = import.meta.env.VITE_WINGS_DATA_MODE ?? 'unknown';
export const isProductionDeploy = wingsDeployContext === 'production';
