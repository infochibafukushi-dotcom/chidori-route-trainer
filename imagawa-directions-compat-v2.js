(() => {
  const PATCH_FLAG = Symbol.for('chidori.imagawaDirectionsCompat.v2');
  const previousLoadMaps = loadMaps;

  function patchDirectionsForImagawa(googleApi) {
    const prototype = googleApi?.maps?.DirectionsService?.prototype;
    if (!prototype || prototype[PATCH_FLAG]) return;

    const routeWithHokueiGuard = prototype.route;
    prototype.route = function routeWithImagawaCompatibility(request, callback) {
      const isImagawa = typeof routeState !== 'undefined' && routeState?.routeId === 'route-2';
      if (!isImagawa || typeof callback === 'function') {
        return routeWithHokueiGuard.call(this, request, callback);
      }

      return new Promise((resolve, reject) => {
        routeWithHokueiGuard.call(this, request, (result, status) => {
          const okStatus = googleApi.maps.DirectionsStatus?.OK || 'OK';
          if (status === okStatus || status === 'OK') {
            resolve(result);
            return;
          }
          reject(new Error(`Google Mapsの道路ルートを取得できませんでした（${status || 'UNKNOWN'}）。`));
        });
      });
    };

    prototype[PATCH_FLAG] = true;
  }

  loadMaps = async function loadMapsWithImagawaCompatibility() {
    const googleApi = await previousLoadMaps();
    patchDirectionsForImagawa(googleApi);
    return googleApi;
  };
})();
