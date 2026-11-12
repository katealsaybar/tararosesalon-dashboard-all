/* THE ONE GLOSSARY. What each metric on the staff pages means, written once. Staff Dashboards and the performance frame read it for their
   hover and tap tips (performance.js TIPS), the dashboard search reads it for its Metric results (search.js GLOSSARY), and Staff's 13 Week
   reads it for the tap-a-column-head meaning. Audit 18 Oct 2026 (P3-18): the three copies had drifted (search dropped "from Phorest" and the
   Phorest-view clause, and "it can be on target while the AED is still short"; five metrics were missing from search). Change a meaning here
   and nowhere else. Each row: [key as perf_core names it, the name search shows, the meaning]. */
window.TRS_GLOSSARY = [
  ["total_revenue", "Total revenue", "Your service sales this month from Phorest, before VAT. Retail is not included."],
  ["hair_services", "Hair services", "Your service sales minus treatments, before VAT."],
  ["treatments", "Treatments", "Treatment sales on your clients this month, from the branch ledger, before VAT."],
  ["treatments_pct", "Treatments %", "Treatments as a share of your hair services: treatments ÷ hair services × 100. It can be on target while the AED is still short."],
  ["retail", "Retail", "Products you sold this month, from Phorest, before VAT."],
  ["retail_pct", "Retail %", "Retail as a share of your service sales: retail ÷ total revenue × 100. It can be on target while the AED is still short."],
  ["avg_bill", "Average bill", "Your service sales from Phorest divided by your client numbers (the ledger’s count, or Phorest’s visits on the Phorest view)."],
  ["rebooking_pct", "Rebooking %", "The share of your clients who booked their next visit before they left."],
  ["retention_pct", "Retention %", "Of the returning clients you saw 3 to 6 months ago, the share you have seen again in the last 3 months."],
  ["clients", "Client numbers", "The clients you saw this month: the branch ledger’s count, or Phorest’s visits on the Phorest view."],
  ["req", "Request", "Returning clients who booked with you by name. From the branch ledger, or Phorest’s RQ count on the Phorest view."],
  ["salon", "Salon", "Returning clients who had no preference, so the salon booked them with you. From the branch ledger; Phorest does not split this out."],
  ["new_clients", "New", "Brand new clients on their first visit who did not ask for anyone, so the salon booked them with you. From the branch ledger, or Phorest’s own new-client count on the Phorest view."],
  ["ncr", "New client requests", "New clients who asked for you by name, usually through a referral or your socials."],
  ["request_pct", "Request rate %", "Clients who asked for you (request clients plus new client requests) as a share of your client numbers."],
  ["conversion_pct", "Conversion %", "Of the brand new clients whose first visit was with you 3 to 6 months ago, the share who came back within 12 weeks."],
  ["column_fill_pct", "Column fill %", "Your booked hours as a share of your available hours, from Phorest."],
  ["colour_pct", "Colour %", "The share of your client visits this month that included a colour service."],
  ["reputation", "Reputation score", "Average star rating of the Google reviews that name you or come from your clients, over the last 90 days. Counts once you have at least 3."],
  ["google_reviews", "Google reviews", "Google reviews this month that name you."],
  ["social_feed", "Feed posts", "Your posts tagging @tararosesalon this month, plus salon posts you are a collaborator on. Each post counts once."],
  ["social_workdays", "Workday posts", "Days you worked this month on which you posted with @tararosesalon, were a collaborator on a salon post, or mentioned the salon in your story."],
];
window.trsGlossary = {
  tips: function () { var o = {}; TRS_GLOSSARY.forEach(function (g) { o[g[0]] = g[2]; }); return o; },
  def: function (k) { for (var i = 0; i < TRS_GLOSSARY.length; i++) if (TRS_GLOSSARY[i][0] === k) return TRS_GLOSSARY[i][2]; return ''; },
};
