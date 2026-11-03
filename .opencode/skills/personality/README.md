# Personality

Choose how the assistant explains things without changing its tools or safety
rules. Each style is saved as a normal skill, connected through this parent.

## Ask naturally

- "Which personality are you using?"
- "Use Plain English in this chat."
- "Give me more detail this time."
- "Save a personality called Short Answers: answer in a few clear sentences."
- "Return this chat to my default personality."

The first included style is [Plain English](../personality-plain-english/SKILL.md).
It explains things as if the reader knows nothing about technology. It does not
add a debating or pushback persona.

## Prerequisites and behaviour

Skill discovery and the personality tool are separate capabilities. Skills must
be registered with the current OpenCode loader. The optional custom tool must
also be activated through the consumer's supported plugin setup. Instructions
alone cannot guarantee a fresh chat will use a style.

When the tool is available, it can report the current style, list/read styles,
select/reset the current chat, and preview/save a new subtype skill. Saves use
native permissions and a revision-bound preview. A saved style does not become
the default automatically. Existing skills are not overwritten.

A short model-context reminder keeps the selected response rules available
without repeatedly loading all personality skills. It does not replace or
disable long-chat summaries. Tool checks are for startup, missing context, and
requested changes, not every reply.

## Verify and troubleshoot

Check the current style, select another in one chat, and confirm another chat
is unchanged. Reopen the first chat and check again. Separately test a new chat,
a long chat, and another project after approved global activation. Static tests
do not prove the model actually writes in the requested style.

If the tool or style is missing, report that and follow the user's immediate
wording. Do not install a substitute or claim that an unsaved choice persists.
Global rollout, restarts, publication and Git operations keep their own gates.

This README and other references are not automatically loaded with the skill.
