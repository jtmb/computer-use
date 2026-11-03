import { Rpc } from "@opencode/plugin"
import { coordinationInboxContract, coordinationSettingsContract } from "./rpc-contract.ts"
import { rpcCompatible } from "./rpc-compatible.ts"

export const CoordinationSettings = Rpc.define(rpcCompatible(coordinationSettingsContract))
export const CoordinationInbox = Rpc.define(rpcCompatible(coordinationInboxContract))
