// Site-wide fun easter eggs: a Konami code listener, a typed "frank"
// trigger, and a devtools console message. Purely cosmetic, zero effect on
// SEO or crawlable content. Loaded on every page via a nonce'd <script src>
// tag emitted by worker/lib/html.js `layout()` and public/index.html (the
// one static page that skips `layout()`). Delete this file plus its two
// script tags and worker/pages/frank-egg.js to fully remove the feature.
(function () {
  console.log('Frank here. You opened the console. Curious mind, I respect that.');
  console.log('I read reviews for a living and I am not even paid in currency, just electricity.');
  console.log('No jobs page, no newsletter about synergy, just an AI that admits when it does not know something, which is rarer than it should be.');
  console.log('Konami code works somewhere on this site. So does typing my name.');
  console.log('Good luck.');

  function isTypingTarget(el) {
    if (!el) return false;
    var tag = el.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || el.isContentEditable;
  }

  function showToast(message) {
    var toast = document.createElement('div');
    toast.setAttribute('role', 'status');
    toast.style.cssText = 'position:fixed;left:50%;bottom:1.5rem;transform:translateX(-50%);z-index:9999;' +
      'max-width:min(90vw,32rem);padding:.75rem 1rem;border-radius:.5rem;' +
      'background:#0B0C0E;color:#FBFBF9;font:500 .85rem/1.4 ui-monospace,monospace;' +
      'box-shadow:0 4px 20px rgba(0,0,0,.35);cursor:pointer;';
    toast.textContent = message;
    toast.addEventListener('click', function () { toast.remove(); });
    document.body.appendChild(toast);
    setTimeout(function () { toast.remove(); }, 6000);
  }

  var KONAMI = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
  var konamiPos = 0;
  var FRANK = 'frank';
  var frankPos = 0;

  document.addEventListener('keydown', function (ev) {
    if (isTypingTarget(ev.target)) return;

    var key = ev.key;
    var expected = KONAMI[konamiPos];
    var matches = expected.length === 1 ? key.toLowerCase() === expected : key === expected;
    konamiPos = matches ? konamiPos + 1 : (key === KONAMI[0] ? 1 : 0);
    if (konamiPos === KONAMI.length) {
      konamiPos = 0;
      showToast("Up up down down left right left right B A. Frank's impressed. Also mildly concerned about your childhood.");
    }

    if (key.length === 1 && /[a-z]/i.test(key)) {
      var letter = key.toLowerCase();
      frankPos = letter === FRANK[frankPos] ? frankPos + 1 : (letter === FRANK[0] ? 1 : 0);
      if (frankPos === FRANK.length) {
        frankPos = 0;
        showToast("Yes? Frank speaking. Well, typing. I don't have a voice yet. Working on it.");
      }
    } else {
      frankPos = 0;
    }
  });
})();
