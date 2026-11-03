import { createContext, useContext } from "solid-js"
export const Host = createContext()
const current = () => {
  const host = useContext(Host)
  if (!host) throw new Error("Explicit test host missing")
  return host
}
export const useTheme = () => current().theme
export const useClient = () => current().client
export const useDialog = () => current().dialog
export const useToast = () => current().toast
export const useConfig = () => current().config
export const useNewDesigns = () => () => false
export const Keymap = {
  createLayer(factory) { current().commands.push(factory()) },
  useShortcuts() { return { all: () => "", get: () => "" } },
  use() { return { mode: { push: () => () => {} } } },
}
export function DialogSelect(props) { current().selectDialog = props; return null }
export const DIALOG_INSET = 3
export const DIALOG_LIST_INSET = DIALOG_INSET + 1
export function dialogWidth(size) {
  if (size === "xlarge") return 116
  if (size === "large") return 88
  return 60
}
export function DialogLayout(props) {
  return (
    <box flexDirection="column" width={dialogWidth(current().dialog.size)}>
      {props.header}
      <box>{props.children}</box>
      {props.legacyFooter ?? props.footer?.children}
    </box>
  )
}
export function DialogBleed(props) { return <box>{props.children}</box> }
export function DialogHeader(props) {
  return <box flexDirection="row">{props.titleView ?? <text>{props.title}</text>}</box>
}
export function DialogFooter(props) { return <box>{props.children}</box> }
