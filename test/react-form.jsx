import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
function App() {
  const [s, set] = useState({ fn: '', mail: '', phone: '', agree: false, plan: '' });
  const on = (k) => (e) => set({ ...s, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  return (<form id="react-form">
    <h3>React</h3>
    <input name="firstName" placeholder="Имя" value={s.fn} onChange={on('fn')} />
    <input name="userEmail" placeholder="Email" value={s.mail} onChange={on('mail')} />
    <input data-testid="contact-phone" placeholder="Телефон" value={s.phone} onChange={on('phone')} />
    <label><input type="checkbox" checked={s.agree} onChange={on('agree')} /> Я согласен с условиями</label>
    <select value={s.plan} onChange={on('plan')}><option value="">Выберите тариф</option><option value="a">Базовый</option><option value="b">Про</option></select>
    <pre id="react-state">{JSON.stringify(s)}</pre>
  </form>);
}
createRoot(document.getElementById('react-root')).render(<App />);
