document.addEventListener("DOMContentLoaded", function () {
  var yearEl = document.getElementById("year");
  if (yearEl) {
    yearEl.textContent = String(new Date().getFullYear());
  }

  var button = document.getElementById("greet-button");
  var greeting = document.getElementById("greeting");
  if (button && greeting) {
    button.addEventListener("click", function () {
      greeting.textContent = "Hello, and welcome!";
    });
  }
});
