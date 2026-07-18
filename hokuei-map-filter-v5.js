(() => {
  const originalLoadMaps = loadMaps;
  let mapConstructorPatched = false;

  const routeMapStyles = [
    {
      featureType: 'transit.station.bus',
      elementType: 'labels.icon',
      stylers: [{ visibility: 'off' }],
    },
    {
      featureType: 'transit.station.bus',
      elementType: 'labels.text',
      stylers: [{ visibility: 'off' }],
    },
    {
      featureType: 'transit.station',
      elementType: 'labels.icon',
      stylers: [{ visibility: 'off' }],
    },
  ];

  loadMaps = async function loadMapsWithDirectionFilter() {
    const googleApi = await originalLoadMaps();
    if (mapConstructorPatched) return googleApi;

    const OriginalMap = googleApi.maps.Map;
    const FilteredMap = new Proxy(OriginalMap, {
      construct(target, args) {
        const [element, options = {}] = args;
        const isRouteMap = element?.id === 'routeMap';
        const patchedOptions = isRouteMap
          ? {
              ...options,
              styles: [...(options.styles || []), ...routeMapStyles],
            }
          : options;
        return Reflect.construct(target, [element, patchedOptions], target);
      },
    });

    googleApi.maps.Map = FilteredMap;
    mapConstructorPatched = true;
    return googleApi;
  };
})();