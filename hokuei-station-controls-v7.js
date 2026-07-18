(() => {
  const FIX_VERSION = '2026-07-18-station-controls-v7';
  const TARGET_STOPS = ['海楽東児童公園', '海楽西児童公園'];
  const CACHE_FLAG = `chidori-${FIX_VERSION}`;
  const originalLoadMaps = loadMaps;
  let placesLibraryPromise = null;

  const normalize = (value = '') => String(value)
    .normalize('NFKC')
    .replace(/[\s　・･()（）「」『』]/g, '')
    .replace(/バス停留所|バス停|停留所/g, '')
    .toLowerCase();

  function targetFromQuery(textQuery = '') {
    return TARGET_STOPS.find((name) => String(textQuery).includes(name)) || null;
  }

  loadMaps = async function loadMapsWithExactKairakuStops() {
    const googleApi = await originalLoadMaps();
    if (googleApi.maps.__chidoriExactKairakuPatched) return googleApi;

    const originalImportLibrary = googleApi.maps.importLibrary.bind(googleApi.maps);
    googleApi.maps.importLibrary = async function importLibraryWithExactStopGuard(name) {
      const library = await originalImportLibrary(name);
      if (name !== 'places' || !library?.Place) return library;
      if (placesLibraryPromise) return placesLibraryPromise;

      placesLibraryPromise = Promise.resolve().then(() => {
        const OriginalPlace = library.Place;
        const PlaceProxy = new Proxy(OriginalPlace, {
          get(target, property, receiver) {
            if (property !== 'searchByText') return Reflect.get(target, property, receiver);
            return async (request) => {
              const response = await OriginalPlace.searchByText(request);
              const targetName = targetFromQuery(request?.textQuery);
              if (!targetName) return response;

              const wanted = normalize(targetName);
              const originalPlaces = response?.places || [];
              const exactPlaces = originalPlaces.filter((place) => {
                const found = normalize(place?.displayName || '');
                return found === wanted || found.startsWith(wanted);
              });
              const withoutGenericKairaku = originalPlaces.filter((place) => {
                const found = normalize(place?.displayName || '');
                return found !== '海楽' && found !== 'かいらく';
              });

              return {
                ...response,
                places: exactPlaces.length ? exactPlaces : withoutGenericKairaku,
              };
            };
          },
        });
        return { ...library, Place: PlaceProxy };
      });

      return placesLibraryPromise;
    };

    googleApi.maps.__chidoriExactKairakuPatched = true;
    return googleApi;
  };

  function clearIncorrectKairakuCacheOnce() {
    if (localStorage.getItem(CACHE_FLAG)) return;
    const route = data?.routes?.find((item) => item.id === HOKUEI_ROUTE_ID);
    if (!route) return;

    ['outbound', 'inbound'].forEach((direction) => {
      (route[direction] || []).forEach((stop) => {
        if (!TARGET_STOPS.includes(stop.name)) return;
        stop.lat = null;
        stop.lng = null;
        stop.placeId = null;
        stop.googleMapsURI = null;
        stop.iconMaskURI = null;
        stop.iconBackgroundColor = null;
        stop.positionSource = null;
      });
    });
    save();
    localStorage.setItem(CACHE_FLAG, '1');
  }

  function stationNameFromElement(element) {
    return String(element?.textContent || '').replace(/^\s*\d+\.\s*/, '').trim();
  }

  function installStationControls() {
    const controls = document.getElementById('hokueiBusControls');
    const previousButton = document.getElementById('busPrevious');
    const nextButton = document.getElementById('busNext');
    const sequence = document.getElementById('routeSequence');
    if (!controls || !previousButton || !nextButton || !sequence) return;

    let currentButton = document.getElementById('busCurrent');
    if (!currentButton) {
      currentButton = document.createElement('button');
      currentButton.id = 'busCurrent';
      currentButton.type = 'button';
      currentButton.className = 'secondary bus-control-button current-stop-button';
      currentButton.setAttribute('aria-disabled', 'true');
      currentButton.tabIndex = -1;
      nextButton.insertAdjacentElement('beforebegin', currentButton);
    }

    const updateLabels = () => {
      const active = sequence.querySelector('.route-sequence-stop.active');
      const currentName = stationNameFromElement(active) || '確認中';

      const previousText = previousButton.textContent || '';
      const previousName = previousText.includes('：') ? previousText.split('：').slice(1).join('：').trim() : '';
      const normalizedPrevious = previousName && !previousText.includes('なし') ? `前：${previousName}` : '前：なし';
      if (previousButton.textContent !== normalizedPrevious) previousButton.textContent = normalizedPrevious;

      const nextText = nextButton.textContent || '';
      const nextName = nextText.includes('：') ? nextText.split('：').slice(1).join('：').trim() : '';
      const normalizedNext = nextName && !nextText.includes('到着') ? `次：${nextName}` : '次：終点';
      if (nextButton.textContent !== normalizedNext) nextButton.textContent = normalizedNext;

      const currentText = `現在：${currentName}`;
      if (currentButton.textContent !== currentText) currentButton.textContent = currentText;
    };

    if (!controls.__chidoriStationObserver) {
      const observer = new MutationObserver(updateLabels);
      observer.observe(controls, { childList: true, subtree: true, characterData: true });
      observer.observe(sequence, { attributes: true, subtree: true, attributeFilter: ['class'] });
      controls.__chidoriStationObserver = observer;
    }
    updateLabels();
  }

  const pageObserver = new MutationObserver(() => installStationControls());
  pageObserver.observe(document.getElementById('app'), { childList: true, subtree: true });

  setTimeout(() => {
    clearIncorrectKairakuCacheOnce();
    installStationControls();
  }, 0);
})();