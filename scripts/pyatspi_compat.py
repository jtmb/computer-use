"""Minimal pyatspi facade backed by gi.repository.Atspi.

desktop-control.py uses a small subset of pyatspi's object model. On systems
where python3-pyatspi is unavailable but PyGObject and the Atspi 2.0 typelib
are installed, this module reproduces that subset so the existing call sites
work unchanged. pyatspi remains the preferred backend when it is importable.
"""

from __future__ import annotations

import gi

gi.require_version("Atspi", "2.0")

from gi.repository import Atspi


DESKTOP_COORDS = 0
WINDOW_COORDS = 1

_COORD_TYPES = {
    DESKTOP_COORDS: Atspi.CoordType.SCREEN,
    WINDOW_COORDS: Atspi.CoordType.WINDOW,
    2: Atspi.CoordType.PARENT,
}


def safe(callable_, default=None):
    try:
        return callable_()
    except Exception:
        return default


def stateToString(value) -> str:
    """Return the pyatspi-style untranslated state name for a state value."""
    try:
        state = Atspi.StateType(int(value))
    except (TypeError, ValueError):
        return "unknown"
    return (getattr(state, "value_nick", "") or "unknown").replace("-", " ")


class _StateSet:
    def __init__(self, state_set):
        self._state_set = state_set

    def getStates(self) -> list:
        states = safe(lambda: list(self._state_set.get_states()), None)
        if states is not None:
            return states
        bitmask = safe(lambda: int(self._state_set.states), 0) or 0
        return [
            Atspi.StateType(index)
            for index in range(64)
            if bitmask & (1 << index)
        ]


class _Component:
    def __init__(self, node):
        self._node = node

    def getExtents(self, coord_type):
        coord = _COORD_TYPES.get(int(coord_type), Atspi.CoordType.SCREEN)
        return Atspi.Component.get_extents(self._node, coord)

    def grabFocus(self) -> bool:
        return bool(Atspi.Component.grab_focus(self._node))


class _Text:
    def __init__(self, node):
        self._node = node

    @property
    def characterCount(self) -> int:
        return int(Atspi.Text.get_character_count(self._node))

    def getText(self, start: int, end: int) -> str:
        return Atspi.Text.get_text(self._node, start, end)


class _EditableText:
    def __init__(self, node):
        self._node = node

    def setTextContents(self, contents: str) -> bool:
        return bool(Atspi.EditableText.set_text_contents(self._node, contents))


class _Accessible:
    __slots__ = ("_node",)

    def __init__(self, node):
        self._node = node

    @property
    def name(self):
        return self._node.get_name()

    @property
    def childCount(self) -> int:
        return int(self._node.get_child_count())

    def __getitem__(self, index: int):
        count = self.childCount
        if index < 0:
            index += count
        if index < 0 or index >= count:
            raise IndexError(index)
        return _wrap(self._node.get_child_at_index(index))

    def get_description(self):
        return self._node.get_description()

    def getRoleName(self) -> str:
        return self._node.get_role_name()

    def getState(self) -> _StateSet:
        return _StateSet(self._node.get_state_set())

    def get_n_actions(self) -> int:
        return int(self._node.get_n_actions())

    def get_action_name(self, index: int):
        return self._node.get_action_name(index)

    def do_action(self, index: int) -> bool:
        return bool(self._node.do_action(index))

    def queryComponent(self) -> _Component:
        node = safe(lambda: self._node.get_component())
        if node is None:
            raise NotImplementedError("component interface is unavailable")
        return _Component(node)

    def queryText(self) -> _Text:
        node = safe(lambda: self._node.get_text())
        if node is None:
            raise NotImplementedError("text interface is unavailable")
        return _Text(node)

    def queryEditableText(self) -> _EditableText:
        node = safe(lambda: self._node.get_editable_text())
        if node is None:
            raise NotImplementedError("editable text interface is unavailable")
        return _EditableText(node)


def _wrap(node):
    if node is None or isinstance(node, _Accessible):
        return node
    return _Accessible(node)


class _Registry:
    @staticmethod
    def getDesktop(index: int) -> _Accessible:
        return _Accessible(Atspi.get_desktop(index))


class _PyatspiCompat:
    DESKTOP_COORDS = DESKTOP_COORDS
    WINDOW_COORDS = WINDOW_COORDS
    Registry = _Registry()
    stateToString = staticmethod(stateToString)


pyatspi = _PyatspiCompat()
