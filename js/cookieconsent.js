<script src="https://cdn.jsdelivr.net/npm/cookieconsent@3/build/cookieconsent.min.js"></script>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/cookieconsent@3/build/cookieconsent.min.css" />
<script>
  window.addEventListener("load", function(){
    window.cookieconsent.initialise({
      palette: {
        popup: { background: "#000" },
        button: { background: "#f1d600" }
      },
      theme: "classic",
      content: {
        message: "This site uses cookies to enhance your experience. By continuing, you accept our use of cookies.",
        dismiss: "Got it!",
        link: "Learn more",
        href: "https://policies.google.com/technologies/cookies"
      },
      onInitialise: function (status) {
        if (status === cookieconsent.status.allow) {
          loadGA();
        }
      },
      onStatusChange: function(status) {
        if (status === cookieconsent.status.allow) {
          loadGA();
        }
      }
    });

    function loadGA() {
      var script = document.createElement("script");
      script.setAttribute("async", "");
      script.setAttribute("src", "https://www.googletagmanager.com/gtag/js?id={{ site.google_analytics }}");
      document.head.appendChild(script);

      window.dataLayer = window.dataLayer || [];
      function gtag(){ dataLayer.push(arguments); }
      gtag('js', new Date());
      gtag('config', '{{ site.google_analytics }}');
    }
  });
</script>
