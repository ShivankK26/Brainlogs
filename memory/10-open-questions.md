# Open questions

Things that are genuinely unknown, as opposed to merely unbuilt. Listed so the
next session does not mistake a guess for a fact.

## Nobody has seen the strip except the owner

Screen recording is not granted to the shell these sessions run in, so
`screencapture` fails. Every statement about how the strip looks comes from the
code and from the owner's screenshots of other screens. Its position, its
sizing against content, how it reads over a dark app, whether the one-pixel
parked window is truly invisible: all unverified.

## The app disappeared once and it was never explained

On 2026-09-20 the installer copied the bundle, printed success, opened it, the
core started, and seconds later `/Applications/Brainlogs.app` did not exist.
No crash report, nothing in the system log, nothing in the Trash. A
reinstallation worked and it has not happened again. The installer now verifies
and retries, which turns a repeat into a loud failure rather than a silent one,
but the cause is unknown.

## Does `front_is_fullscreen` actually fire?

The silence rule compares the focused window's Accessibility size against the
monitor. It compiles and it has never been seen to trigger, because testing it
means presenting or sharing a screen. The sharing-phrase check in
`screenIsShared` is unit tested; the geometry check is not.

## Are calls ever detected?

`peopleIn` reads a call's roster by matching known person entities against the
text on screen, and it requires a full name with a space. On the owner's
database it has returned nothing so far, partly because there were no call
places in the window examined. Whether Meet or Zoom put enough readable names
on screen for this to work is unproven.

## Commitment quality on real data

The owner's database currently holds two open commitments, both with
non-person counterparties ("Preference", "Members"). The junk filters work on
the obvious cases; the extractor still produces parties that are not people.
The strip only shows commitments matching a person in front of you, so these
are invisible there, but the Commitments screen shows them.

## Windows and Linux

Built every release, never run. The strip's positioning code is macOS-tuned,
`foreground_window_size` returns nothing off macOS so the full-screen rule
fails open, and nobody has looked at how the tray menu reads on either.

## Is thirty days of retention right?

Default retention is thirty days and the owner has not changed it. Change
detection gets better the longer the window, and the database gets larger. No
data on where the line should be.
