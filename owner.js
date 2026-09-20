(() => {
  const form = document.querySelector('#ownerSearchForm');
  const input = document.querySelector('#ownerSearchInput');
  const status = document.querySelector('#searchStatus');
  const results = document.querySelector('#ownerResults');
  const searchPanel = document.querySelector('#searchPanel');
  const claimPanel = document.querySelector('#claimPanel');
  const successPanel = document.querySelector('#successPanel');
  const claimForm = document.querySelector('#claimForm');
  let selected = null;

  function setStatus(node, message, isError = false) {
    node.textContent = message;
    node.classList.toggle('error', isError);
  }

  function propertyMeta(property) {
    return [property.town, property.region, property.category].filter(Boolean).join(' · ') || 'מקום אירוח';
  }

  function chooseProperty(property) {
    selected = property;
    document.querySelector('#claimPropertyId').value = property.id;
    const box = document.querySelector('#selectedProperty');
    box.replaceChildren();
    const strong = document.createElement('strong');
    const meta = document.createElement('span');
    strong.textContent = property.name;
    meta.textContent = propertyMeta(property);
    box.append(strong, meta);
    searchPanel.hidden = true;
    claimPanel.hidden = false;
    window.scrollTo({ top: claimPanel.offsetTop - 24, behavior: 'smooth' });
    document.querySelector('#claimName').focus({ preventScroll: true });
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const q = input.value.trim();
    if (q.length < 2) return setStatus(status, 'כתבו לפחות שתי אותיות לחיפוש.', true);
    const button = form.querySelector('button');
    button.disabled = true;
    results.replaceChildren();
    setStatus(status, 'מחפשים במאגר...');
    try {
      const response = await fetch(`/api/properties?q=${encodeURIComponent(q)}&limit=12`);
      if (!response.ok) throw new Error('search_failed');
      const data = await response.json();
      if (!data.items.length) {
        setStatus(status, 'לא מצאנו מקום בשם הזה. נסו שם קצר יותר או חפשו לפי יישוב.');
        return;
      }
      setStatus(status, `נמצאו ${data.total} מקומות. מוצגות התוצאות המתאימות הראשונות.`);
      data.items.forEach((property) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'propertyChoice';
        const text = document.createElement('span');
        text.className = 'propertyChoiceText';
        const name = document.createElement('strong');
        const meta = document.createElement('span');
        const choose = document.createElement('span');
        choose.className = 'chooseLabel';
        name.textContent = property.name;
        meta.textContent = propertyMeta(property);
        choose.textContent = 'זה המקום שלי';
        text.append(name, meta);
        button.append(text, choose);
        button.addEventListener('click', () => chooseProperty(property));
        results.append(button);
      });
    } catch {
      setStatus(status, 'החיפוש לא זמין כרגע. נסו שוב בעוד רגע.', true);
    } finally {
      button.disabled = false;
    }
  });

  document.querySelector('#changeProperty').addEventListener('click', () => {
    claimPanel.hidden = true;
    searchPanel.hidden = false;
    selected = null;
    searchPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  claimForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const claimStatus = document.querySelector('#claimStatus');
    const data = Object.fromEntries(new FormData(claimForm));
    if (!selected) return setStatus(claimStatus, 'צריך לבחור מקום לפני שליחת הבקשה.', true);
    if (!data.phone?.trim() && !data.email?.trim()) return setStatus(claimStatus, 'מלאו לפחות טלפון או אימייל.', true);
    const submit = document.querySelector('#claimSubmit');
    submit.disabled = true;
    setStatus(claimStatus, 'שומרים את הבקשה...');
    try {
      const response = await fetch('/api/claims', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'submit_failed');
      claimPanel.hidden = true;
      successPanel.hidden = false;
      const route = result.verification?.method === 'phone'
        ? `נמצא במאגר מספר עסקי המסתיים ב-${result.verification.destinationMask}. לאחר חיבור שירות ההודעות יישלח אליו קוד אימות. לא ניתנה גישת עריכה.`
        : 'לא נמצא במאגר אמצעי קשר מתאים. הבקשה הועברה לבדיקה ידנית ולא ניתנה גישת עריכה.';
      document.querySelector('#verificationRoute').textContent = route;
      document.querySelector('#claimReference').textContent = `מספר בקשה: ${result.reference}`;
      successPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (error) {
      const message = error.message === 'duplicate_claim'
        ? 'כבר התקבלה בקשה עבור המקום ופרטי הקשר האלה. אין צורך לשלוח שוב.'
        : error.message === 'invalid_contact'
          ? 'בדקו שמספר הטלפון או כתובת האימייל תקינים.'
          : 'לא הצלחנו לשמור את הבקשה. נסו שוב בעוד רגע.';
      setStatus(claimStatus, message, true);
      submit.disabled = false;
    }
  });
})();
