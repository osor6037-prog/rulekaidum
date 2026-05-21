function init() {

  showLoading(true);

  // กัน loading ค้าง
  setTimeout(() => {
    showLoading(false);
  }, 4000);

  if (window._fbReady) {

    showLoading(false);

    startListening();

  } else {

    document.addEventListener('firebase-ready', () => {

      showLoading(false);

      startListening();

    });

    document.addEventListener('firebase-failed', () => {

      showLoading(false);

      console.log('Firebase failed');

      applyFiltersAndResetRender();

    });

  }

  setupInfiniteScroll();
}



function startListening() {

  const dbRef = path => window._fbRef(window._fbDB, path);

  window._fbOnValue(

    dbRef('images'),

    snapshot => {

      const data = snapshot.val();

      images = data
        ? Object.values(data).sort((a, b) => b.id - a.id)
        : [];

      showLoading(false);

      if (images.length === 0) {

        loadSamples(true);

      } else {

        applyFiltersAndResetRender();

      }

    },

    error => {

      console.log(error);

      showLoading(false);

      toast('โหลดข้อมูลไม่สำเร็จ');

      applyFiltersAndResetRender();

    }

  );

}
