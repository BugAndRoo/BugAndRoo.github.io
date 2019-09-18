var template = $("#calendar-template");
var gigsUpcoming = $("#gigs-upcoming");
var gigsPast = $("#gigs-past");

$.ajax({
    url: "/files/calendar.json",
    type: "GET",
    success: function (data) {

        var gig, gigDate;
        var now = new Date();
        var el;
        for (var i = 0; i < data.length; ++i) {
            gig = data[i];
            gigDate = new Date(Date.parse(gig.date));

            el = $(template.html());

            $(".gig_title", el).text(gig.title);
            $(".gig_date", el).text(gigDate.toLocaleString('en-us', {  weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }));
            $(".gig_time", el).text(gigDate.toLocaleString('en-us', {  hour: '2-digit', minute: '2-digit' }));
            $(".gig_venue", el).text(gig.venue.name).attr("href", gig.url);
            $(".gig_address", el).text(gig.venue.address);
            $(".gig_phone", el).text(gig.venue.phone).attr("href","tel:"+gig.venue.phone);
            if (gigDate > now) {
                // future

                gigsUpcoming.find(".gigs").append(el);
                gigsUpcoming.removeClass("d-none");
            }
            else {
                // past

                gigsPast.find(".gigs").append(el);
                gigsPast.removeClass("d-none");
            }
        }
    }
});
