// =====================================================
// worker-dashboard.html-ல இந்த JS code add பண்ணு
// =====================================================

// 1) Nav-ல Reviews link add பண்ணு — navbar-brand-க்கு அருகில்:
// <span style="font-size:13px;color:#667eea;font-weight:600;cursor:pointer;padding:6px 14px;border:1px solid #e0e0e0;border-radius:20px;" onclick="showReviewsTab()">⭐ My Reviews</span>

// 2) இந்த variables top-ல add பண்ணு:
var allReviews    = [];
var rvFilter      = 'all';

// 3) loadDashboard() function-ல இந்த code add பண்ணு (bookings fetch-க்கு கீழே):
async function loadReviews(token) {
    try {
        var res  = await fetch(API_URL + '/reviews/worker/' + (workerData.id || ''), {
            headers: { 'Authorization': 'Bearer ' + token }
        });
        var data = await res.json();
        if (data.success) {
            allReviews = data.reviews || [];
            renderReviews();
        }
    } catch(e) {}
}

function showReviewsTab() {
    document.getElementById('requestsSection').style.display = 'none';
    document.getElementById('reviewsSection').style.display  = 'block';
    var token = localStorage.getItem('token');
    if (token) loadReviews(token);
}

function hideReviewsTab() {
    document.getElementById('reviewsSection').style.display  = 'none';
    document.getElementById('requestsSection').style.display = 'block';
}

function filterRv(f, btn) {
    rvFilter = f;
    document.querySelectorAll('#rvFilters .filter-tab').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    renderReviews();
}

function renderReviews() {
    var list = rvFilter === 'all'
        ? allReviews
        : allReviews.filter(r => String(r.rating) === rvFilter);

    // Update badge
    var badge = document.getElementById('rvBadge');
    badge.textContent     = allReviews.length;
    badge.style.display   = allReviews.length > 0 ? 'inline-block' : 'none';

    // Summary strip
    if (allReviews.length > 0) {
        var sum  = allReviews.reduce((a, r) => a + r.rating, 0);
        var avg  = (sum / allReviews.length).toFixed(1);
        var dist = {1:0,2:0,3:0,4:0,5:0};
        allReviews.forEach(r => dist[r.rating]=(dist[r.rating]||0)+1);

        document.getElementById('rvAvgBig').textContent = avg;
        document.getElementById('rvTotalLbl').textContent = allReviews.length + ' review' + (allReviews.length!==1?'s':'');
        document.getElementById('rvSummaryStrip').style.display = 'block';

        var starHtml = '';
        for (var i=1;i<=5;i++) starHtml += '<span style="font-size:18px;color:'+(i<=Math.round(avg)?'#f59e0b':'#ddd')+'">'+(i<=Math.round(avg)?'★':'☆')+'</span>';
        document.getElementById('rvStarsBig').innerHTML = starHtml;

        var barsHtml = [5,4,3,2,1].map(n => {
            var pct = Math.round((dist[n]/allReviews.length)*100);
            return '<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">'+
                '<span style="font-size:11.5px;color:#666;width:8px">'+n+'</span>'+
                '<div style="flex:1;height:6px;background:#f0e8c0;border-radius:3px;overflow:hidden">'+
                    '<div style="height:100%;background:#f59e0b;border-radius:3px;width:'+pct+'%"></div>'+
                '</div>'+
                '<span style="font-size:11px;color:#999;width:20px">'+dist[n]+'</span>'+
            '</div>';
        }).join('');
        document.getElementById('rvBarsWrap').innerHTML = barsHtml;
    }

    var container = document.getElementById('rvContainer');
    if (!list.length) {
        container.innerHTML = '<div style="text-align:center;padding:2.5rem;color:#aaa;font-size:13.5px">'+
            (allReviews.length ? 'No reviews at this rating.' : 'No reviews yet. Complete bookings to receive reviews!')+'</div>';
        return;
    }

    container.innerHTML = list.map(r => {
        var starsHtml = '';
        for (var i=1;i<=5;i++) starsHtml += '<span style="font-size:14px;color:'+(i<=r.rating?'#f59e0b':'#ddd')+'">'+(i<=r.rating?'★':'☆')+'</span>';
        var custInitial = (r.customer_name||'C').charAt(0).toUpperCase();
        return '<div class="request-card" style="margin:.75rem 1.25rem;">'+
            '<div class="request-header">'+
                '<div class="customer-info">'+
                    '<div class="customer-avatar" style="background:linear-gradient(135deg,#f59e0b,#d97706)">'+custInitial+'</div>'+
                    '<div class="customer-details">'+
                        '<h4>'+ esc(r.customer_name||'Customer') +'</h4>'+
                        '<p style="display:flex;gap:3px;align-items:center">'+ starsHtml +'</p>'+
                    '</div>'+
                '</div>'+
                '<div style="font-size:11.5px;color:#aaa;font-family:monospace">'+ fmtD(r.created_at) +'</div>'+
            '</div>'+
            (r.comment ? '<div style="background:#fffbeb;border-left:3px solid #f59e0b;padding:.65rem 1rem;border-radius:0 8px 8px 0;font-size:13.5px;color:#555;font-style:italic;margin-top:.5rem">"'+esc(r.comment)+'"</div>' : '')+
        '</div>';
    }).join('');
}

function esc(v){return String(v==null?'':v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
function fmtD(d){if(!d)return'—';try{return new Date(d).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'});}catch(e){return d;}}