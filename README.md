# Weather

A widget for [Eva](https://github.com/guplem/eva)'s home page. It shows the weather now, the next hours and the next days, for your last location.

**Demo:** https://guplem.github.io/eva-widget-weather/

The demo shows the weather of your real location when your browser allows it, and of an example location otherwise.

Weather data by [Open-Meteo](https://open-meteo.com/), under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

## What it does

- **The small card** shows the temperature now and the sky.
- **The medium card** adds the next hours, with the chance of rain.
- **The large card** adds the next seven days, with a bar from the low to the high of each day.
- **Full screen** adds the wind, the humidity, the sunrise and the sunset.
- With no stored location, the widget says how to share one from your phone.
- When the location is more than a day old, the widget shows its age: your phone stopped sharing it.
- The widget loads the forecast again every 30 minutes, and when the page shows again.

## The location and Open-Meteo

The widget asks Eva for your last location, at `eva/location.json`. It sends that location to `https://api.open-meteo.com`, rounded to two decimals, about one kilometre. It sends nothing else. Eva asks you for both permissions when you turn the widget on.

The `unit` input picks Celsius or Fahrenheit.

## Add it to Eva

Eva ships this widget, off: turn it on in **Settings > Personalize > Widgets**. Another Eva adds it by its address: `https://github.com/guplem/eva-widget-weather`.

## Run it on your computer

A browser does not run the widget from a double-click on `index.html`. Run a small web server instead:

```sh
npm install
npm start
```

Then open http://localhost:3000/. Add `?size=small`, `medium`, `large` or `full` to the address to see each size.

## Change it

The widget follows the [widget contract](https://github.com/guplem/eva/blob/main/docs/widgets.md) of Eva. `AGENTS.md` says how to work on it, for people and for coding agents. `npm run check` runs every check. The tests answer Open-Meteo with the mock forecast of `tests/forecast.json`.

## License

MIT. See [`LICENSE`](LICENSE). The forecast data belongs to Open-Meteo and its sources.
