/**
 * Module-level handle to the live Sigma instance so non-React code
 * (hotkeys, travel neighbor ordering) can use viewport math.
 */

import type Sigma from "sigma";
import type { EdgeAttrs, NodeAttrs } from "./graphStore";

export type AppSigma = Sigma<NodeAttrs, EdgeAttrs>;

export const sigmaRef: { current: AppSigma | null } = { current: null };
