// Initial product configuration
const INITIAL_PRODUCTS = {
    bulk: ["0W20S", "5W30S", "5W30B", "AW68", "AW16S", "0W20E", "0W30E", "50W", "75W90GL5", "30W", "ATF", "T0-4 10W", "5W40 DIESEL"],
    case: ["0W20B", "5W20B", "AW32", "AW46", "5W40E", "5W30E", "UTH", "80W90GL5", "10W", "15W40 CK4", "10W30 CK4", "70-4 30W"],
    coolant: ["RED 50/50", "GREEN 50/50"],
    others: ["DEF", "Brake Blast", "MOLY 3% EP2", "CVT", "SAE 10W-30 Motor Oil", "OW16S(Quart)"]
};

// Global State
let state = {
    currentCategory: 'bulk',
    products: JSON.parse(localStorage.getItem('lubricant_products')) || INITIAL_PRODUCTS,
    inventory: {} // key: productName, value: expression
};

// Save to LocalStorage
function saveToStorage() {
    localStorage.setItem('lubricant_products', JSON.stringify(state.products));
}

// Safely evaluate mathematical expressions
function evaluateExpression(expr) {
    if (!expr || expr.trim() === '') return 0;
    try {
        // Only allow numbers, plus signs, dots, and spaces
        const safeExpr = expr.replace(/[^0-9+\. ]/g, '');
        return Number(eval(safeExpr)) || 0;
    } catch (e) {
        return 0;
    }
}

// Render Inventory List
function renderInventory() {
    const list = document.getElementById('inventory-list');
    list.innerHTML = '';

    const categoryProducts = state.products[state.currentCategory] || [];

    categoryProducts.forEach((name, index) => {
        const val = state.inventory[name] || '';
        const total = evaluateExpression(val);

        const card = document.createElement('div');
        card.className = 'item-card';
        card.innerHTML = `
            <div class="item-info">
                <div class="item-name">${name}</div>
                <div class="item-result" id="result-${index}">${val ? 'Subtotal: ' + total : ''}</div>
            </div>
            <div class="input-group">
                <input type="text" class="item-input" 
                    placeholder="Val" 
                    value="${val}" 
                    oninput="updateValue('${name}', this.value, ${index})">
            </div>
        `;
        list.appendChild(card);
    });
}

// Update inventory value
window.updateValue = (name, value, index) => {
    state.inventory[name] = value;
    const total = evaluateExpression(value);
    const resultEl = document.getElementById(`result-${index}`);
    if (resultEl) {
        resultEl.innerText = value ? 'Subtotal: ' + total : '';
    }
};

// Toggle Category
document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelector('.tab.active').classList.remove('active');
        tab.classList.add('active');
        state.currentCategory = tab.dataset.id;
        renderInventory();
    });
});

// Management Modal Logic
const modal = document.getElementById('modal-overlay');
document.getElementById('manage-btn').addEventListener('click', () => {
    modal.classList.remove('hidden');
    renderManageList();
});

document.querySelector('.close-modal').addEventListener('click', () => modal.classList.add('hidden'));

function renderManageList() {
    const pList = document.getElementById('product-manage-list');
    pList.innerHTML = '';
    const categoryProducts = state.products[state.currentCategory];

    categoryProducts.forEach((name, index) => {
        const li = document.createElement('li');
        li.style.cssText = 'display:flex; justify-content:space-between; margin-bottom:10px; align-items:center;';
        li.innerHTML = `
            <span>${name}</span>
            <button onclick="removeProduct(${index})" style="background:#ff3b30; color:white; border:none; border-radius:4px; padding:4px 8px;">Delete</button>
        `;
        pList.appendChild(li);
    });
}

window.removeProduct = (index) => {
    state.products[state.currentCategory].splice(index, 1);
    saveToStorage();
    renderManageList();
    renderInventory();
};

document.getElementById('add-product-btn').addEventListener('click', () => {
    const input = document.getElementById('new-product-name');
    const name = input.value.trim();
    if (name) {
        state.products[state.currentCategory].push(name);
        saveToStorage();
        renderManageList();
        renderInventory();
        input.value = '';
    }
});

// PDF Export logic
document.getElementById('export-pdf-btn').addEventListener('click', () => {
    const pdfArea = document.getElementById('pdf-template');
    const tbody = document.getElementById('pdf-tbody');
    document.getElementById('pdf-date').innerText = `Report Date: ${new Date().toLocaleDateString('en-US')} ${new Date().toLocaleTimeString('en-US')}`;

    tbody.innerHTML = '';

    ['bulk', 'case', 'coolant', 'others'].forEach(cat => {
        const products = state.products[cat];
        products.forEach(name => {
            const expr = state.inventory[name] || '-';
            const total = evaluateExpression(expr);
            if (expr !== '-') {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${cat.toUpperCase()}</td>
                    <td>${name}</td>
                    <td>${expr}</td>
                    <td><b>${total}</b></td>
                `;
                tbody.appendChild(tr);
            }
        });
    });

    if (tbody.innerHTML === '') {
        alert('Please enter some data first!');
        return;
    }

    pdfArea.classList.remove('hidden');

    const opt = {
        margin: 10,
        filename: `Lube_Inventory_${new Date().toLocaleDateString()}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2 },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    html2pdf().set(opt).from(pdfArea).save().then(() => {
        pdfArea.classList.add('hidden');
    });
});

// Initialize Date
document.getElementById('current-date').innerText = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

// Init Render
renderInventory();
