# Complaint WhatsApp templates (Kate, 29 Oct 2026)

Create these in respond.io: Settings, Channels, the backup number (channel 569496), Message Templates. Nothing is created yet. Until they are approved, the worker sends the same words as plain text, which only reaches someone who wrote to that number in the last 24 hours.

For all of them: category **Utility**, language **English (UK), en_GB**, footer **Tara Rose Salons**. The wording below is the same as the plain text the worker already sends, so nothing changes for the reader when we switch.

Rules respond.io and Meta apply: a variable cannot be at the very start or end of the body, a variable cannot hold a new line, and a button link can have one variable, at the end.

---

## 1. complaint_alert

Goes to the first responder. Header (text): `New client complaint`

Body:

```
Hi {{1}}, a client complaint came in at {{2}} ({{3}}). It is about {{4}}, so it is yours to look at first.

Tap below to take it. If it is not yours, pass it on in one tap. If nobody takes it in {{5}} it moves to {{6}}.
```

Sample values: `Emma`, `Saadiyat`, `CMP-SAA-20261029-01`, `colour`, `3 hours`, `Ashleigh`

Buttons:
1. Quick reply: `I've got this`
2. Quick reply: `Not mine`
3. URL: `Open it`, `https://trk-salon-os.com/hub/complaint{{1}}`, sample `?cid=2050`

## 2. complaint_escalated

Goes to the next person when it moves on, and to a person it has been assigned to. Header (text): `Complaint waiting for you`

Body:

```
Hi {{1}}, a {{2}} complaint at {{3}} ({{4}}) is now with you. {{5}}

Tap below to take it, or pass it on if it is not yours.
```

Sample values: `Ashleigh`, `colour`, `Saadiyat`, `CMP-SAA-20261029-01`, `Emma W could not get to it in time.`

`{{5}}` is one sentence: `Emma W could not get to it in time.`, `Emma W passed it on.`, `Emma W could not be reached.` or `Cristine assigned it to you.`

Buttons: the same three as complaint_alert.

## 3. complaint_tagged

Goes to the coordinator and to anyone tagged. It says plainly that nothing is needed. No client details. Header (text): `For your information`

Body:

```
Hi {{1}}, a client complaint at {{2}} ({{3}}) has something for you to see. {{4}}

There is nothing you need to do now. You can see how it is going below.
```

Sample values: `Cristine`, `Saadiyat`, `CMP-SAA-20261029-01`, `Emma W is looking after it.`

`{{4}}` is one sentence: `Emma W is looking after it.`, `Kate tagged you.` or, when several tags are joined into one message, `You were tagged on 3 complaints.`

Button: URL `See how it is going`, `https://trk-salon-os.com/hub/complaint{{1}}`, sample `?cid=2050`

## 4. complaint_summary (optional, a fourth)

The daily summary of the minor complaints, to Kate and each coordinator. You asked for three templates; this one is only needed if the summary should reach people outside the 24 hour window. Without it the summary falls back to email. Header (text): `Minor complaints`

Body:

```
Hi {{1}}, {{2}} minor complaints were logged since yesterday: {{3}}. Nothing needs to be done today. You can see them below.
```

Sample values: `Kate`, `3`, `CMP-AQ-20261029-02 price or billing, Al Quoz; CMP-MC-20261029-01 booking or admin, Motor City`

Button: URL `See them`, `https://trk-salon-os.com/hub/complaint{{1}}`, sample `?view=board`

---

## After they are approved

Tell me the four names. They go in `complaint_triage_config` (`template_alert`, `template_escalated`, `template_fyi`) and the worker is changed to send them with the variables above. The Quick reply buttons (`I've got this`, `Not mine`) need a respond.io workflow to do something when tapped. Until that exists they still work as a reply the person can see, and the `Open it` button is the one that takes them to the page. A workflow is optional and last.
