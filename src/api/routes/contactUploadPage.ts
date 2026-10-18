import { NETAI_LOOP_POSTER_URL, NETAI_LOOP_VIDEO_URL } from '../../services/mcp/netaiFigure';

/**
 * #5744 (A): the page a member opens from the link Claude or ChatGPT gave. One
 * file field and one button; the file is read in the browser and sent here, so
 * no number passes through the AI. Georgian first, English under it.
 */
const PAGE_STYLE = `
  body { font-family: system-ui, -apple-system, sans-serif; background: #FAF9F5; margin: 0;
         display: flex; flex-direction: column; align-items: center; min-height: 100vh; color: #22302A; }
  .top { display: flex; align-items: center; gap: 10px; margin: 36px 0 24px; }
  .top span { font-size: 26px; font-weight: 700; }
  .figure { width: 64px; height: 64px; border-radius: 50%; object-fit: cover; }
  .card { background: #fff; border: 1px solid #E8E5DA; border-radius: 24px; padding: 28px;
          max-width: 400px; width: calc(92% - 56px); }
  h1 { font-size: 19px; margin: 0 0 8px; }
  p { color: #6E7268; font-size: 14px; line-height: 1.5; margin: 0 0 18px; }
  input[type=file] { width: 100%; margin-bottom: 16px; font-size: 15px; }
  button { width: 100%; padding: 14px; font-size: 16px; font-weight: 600; border: 0;
           border-radius: 14px; background: #5C8B68; color: #fff; }
  button:disabled { opacity: 0.6; }
  .status { margin-top: 16px; font-size: 15px; }
`;

function page(body: string, script = ''): string {
  return `<!doctype html>
<html lang="ka">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Netai — კონტაქტები</title>
<style>${PAGE_STYLE}</style>
</head>
<body>
<div class="top"><video class="figure" src="${NETAI_LOOP_VIDEO_URL}" poster="${NETAI_LOOP_POSTER_URL}"
  autoplay muted loop playsinline aria-hidden="true"></video><span>Netai</span></div>
<div class="card">${body}</div>
${script}
</body>
</html>`;
}

export function renderUploadPage(postPath: string): string {
  const body = `
<h1>კონტაქტების ატვირთვა</h1>
<p>აირჩიე კონტაქტების ფაილი (.vcf). ის პირდაპირ Netai-ში მოდის, ჩატს არ გადის.<br>
Choose your contacts file (.vcf). It goes straight to Netai, never through the chat.</p>
<input id="file" type="file" accept=".vcf,text/vcard,text/x-vcard">
<button id="send">ატვირთვა · Upload</button>
<div id="status" class="status" aria-live="polite"></div>`;
  const script = `<script>
(function () {
  var button = document.getElementById('send');
  var status = document.getElementById('status');
  button.addEventListener('click', function () {
    var file = document.getElementById('file').files[0];
    if (!file) { status.textContent = 'ჯერ ფაილი აირჩიე · Choose a file first'; return; }
    button.disabled = true;
    status.textContent = 'იტვირთება… · Uploading…';
    file.text().then(function (vcf) {
      return fetch(${JSON.stringify(postPath)}, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vcfContent: vcf })
      });
    }).then(function (res) { return res.json(); }).then(function (json) {
      if (json.success) {
        status.textContent = 'მზადაა: ' + json.data.inFile + ' კონტაქტი ფაილში, ' + json.data.imported +
          ' ახალი. დაბრუნდი ჩატში. · Done: ' + json.data.inFile + ' in the file, ' + json.data.imported + ' new. Go back to the chat.';
      } else {
        status.textContent = json.error; button.disabled = false;
      }
    }).catch(function () {
      status.textContent = 'ვერ აიტვირთა, სცადე თავიდან · Upload failed, try again';
      button.disabled = false;
    });
  });
})();
</script>`;
  return page(body, script);
}

export function renderClosedPage(): string {
  return page(`<h1>ბმული აღარ მოქმედებს</h1>
<p>ეს ბმული უკვე გამოყენებულია ან ვადა გაუვიდა. ჩატში სთხოვე Netai-ს ახალი.<br>
This link was used or has expired. Ask Netai in the chat for a new one.</p>`);
}
