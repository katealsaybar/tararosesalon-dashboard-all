# Complaint WhatsApp templates (Kate, 29 Oct 2026)

Create these in respond.io: Settings, Channels, the backup number (channel 569496), Message Templates. Nothing is created yet. Until they are approved, the worker sends the same words as plain text, which only reaches someone who wrote to that number in the last 24 hours.

For all of them: category **Utility**, language **English (UK), en_GB**, footer **Tara Rose Salons**. The wording below is the same as the plain text the worker already sends, except the buttons. Until the templates are approved, the plain text carries the buttons as three one tap links (`I've got this`, `Not mine, pass it on`, `Open it`): the page does the action when it opens. Real buttons need an approved template.

Rules respond.io and Meta apply: a variable cannot be at the very start or end of the body, a variable cannot hold a new line, and a button link can have one variable, at the end.

---

## 1. complaint_alert

Goes to the first responder. Header (text): `New client complaint`

Body:

```
Hi {{1}}, a client complaint came in at {{2}} ({{3}}). It is about {{4}}, so it is yours to look at first.

Tap below to take it. If it is not yours, pass it on in one tap. If nobody takes it in {{5}} it moves to {{6}}.
```

Sample values: `Emma`, `Saadiyat`, `C-SAA-20261109-KA8412-001`, `colour`, `3 hours`, `Ashleigh`

Buttons:
1. Quick reply: `I've got this`
2. Quick reply: `Not mine`
3. URL: `Open it`, `https://trk-salon-os.com/hub/complaint{{1}}`, sample `?cid=2050`

## 1b. complaint_alert_v2 (ready to submit, NOT submitted, 13 Nov 2026)

`complaint_alert` was REJECTED by Meta on 9 Nov 2026 (error 100-2388299: a variable at the start or the end of the body). The body ended with `{{6}}.`, so the last variable was the last word. v2 keeps every variable and puts a word after the last one. It also drops the sentence about passing it on "in one tap", because the respond.io form only allows URL buttons: taking and passing happen on the page.

Category **Utility**, language **English (UK), en_GB**, footer **Tara Rose Salons**. Set the Category first in the respond.io form (picking it again resets the whole form). Header (text): `New client complaint`

Body:

```
Hi {{1}}, a client complaint came in at {{2}} ({{3}}). It is about {{4}}, so it is yours to look at first.

Tap Open it to take it, or pass it on from the same page. If nobody takes it in {{5}} it moves to {{6}} next.
```

Sample values: `Emma`, `Saadiyat`, `C-SAA-20261109-KA8412-001`, `colour`, `3 hours`, `Ashleigh`

Button: one URL button, `Open it`, `https://trk-salon-os.com/hub/complaint{{1}}`, sample `?c=C-SAA-20261109-KA8412-001`.

After approval: set `complaint_triage_config.template_alert` to `complaint_alert_v2` (the worker reads the name from there). Nothing is switched on by this file.

What still blocks the ladies getting alerts (checked in the database 13 Nov 2026): `dry_run` is true; `template_alert`, `template_escalated` and `template_fyi` are all empty; `wa_on` is false for all 10 people on the chains; `complaint_alert` needs v2 approved by Meta; `complaint_escalated` and `complaint_tagged` were submitted 9 Nov and their approval has not been checked; email works only for 5 leaders and the SMTP secrets are unset. Go-live order, each step Kate's word: v2 approved, set the three template names, pilot with Coach Emma only (`wa_on` for her), then everyone, then `dry_run` off.

---

## 2. complaint_escalated

Goes to the next person when it moves on, and to a person it has been assigned to. Header (text): `Complaint waiting for you`

Body:

```
Hi {{1}}, a {{2}} complaint at {{3}} ({{4}}) is now with you. {{5}}

Tap below to take it, or pass it on if it is not yours.
```

Sample values: `Ashleigh`, `colour`, `Saadiyat`, `C-SAA-20261109-KA8412-001`, `Emma W could not get to it in time.`

`{{5}}` is one sentence: `Emma W could not get to it in time.`, `Emma W passed it on.`, `Emma W could not be reached.` or `Cristine assigned it to you.`

Buttons: the same three as complaint_alert.

## 3. complaint_tagged

Goes to the coordinator and to anyone tagged. It says plainly that nothing is needed. No client details. Header (text): `For your information`

Body:

```
Hi {{1}}, a client complaint at {{2}} ({{3}}) has something for you to see. {{4}}

There is nothing you need to do now. You can see how it is going below.
```

Sample values: `Cristine`, `Saadiyat`, `C-SAA-20261109-KA8412-001`, `Emma W is looking after it.`

`{{4}}` is one sentence: `Emma W is looking after it.`, `Kate tagged you.` or, when several tags are joined into one message, `You were tagged on 3 complaints.`

Button: URL `See how it is going`, `https://trk-salon-os.com/hub/complaint{{1}}`, sample `?cid=2050`

## 4. complaint_summary (optional, a fourth)

The daily summary of the minor complaints, to Kate and each coordinator. You asked for three templates; this one is only needed if the summary should reach people outside the 24 hour window. Without it the summary falls back to email. Header (text): `Minor complaints`

Body:

```
Hi {{1}}, {{2}} minor complaints were logged since yesterday: {{3}}. Nothing needs to be done today. You can see them below.
```

Sample values: `Kate`, `3`, `C-AQ-20261029-XX0000-001 price or billing, Al Quoz; C-MC-20261029-XX0000-001 booking or admin, Motor City`

Button: URL `See them`, `https://trk-salon-os.com/hub/complaint{{1}}`, sample `?view=board`

---

## After they are approved

Tell me the four names. They go in `complaint_triage_config` (`template_alert`, `template_escalated`, `template_fyi`) and the worker is changed to send them with the variables above. The Quick reply buttons (`I've got this`, `Not mine`) need a respond.io workflow to do something when tapped. Until that exists they still work as a reply the person can see, and the `Open it` button is the one that takes them to the page. A workflow is optional and last.

Complaint code format (13 Nov 2026): `C-<BRANCH>-<YYYYMMDD>-<II><NNNN>-<SEQ>`, for example `C-SAA-20261109-KA8412-001` (branch, complaint date, client initials, last 4 phone digits, this client's Nth complaint). Issued once by the database, never changed. The old `CMP-` codes still open the ticket page (alias). The sample values above are made-up.
