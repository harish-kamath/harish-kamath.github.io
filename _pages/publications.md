---
layout: page
permalink: /publications/
title: publications
description: Research papers I have worked on.
years: [2022,2020]
nav: true
---

<div class="publications">

{% for y in page.years %}
  <h2 class="year">{{y}}</h2>
  {% bibliography -f papers -q @*[year={{y}}]* %}
{% endfor %}

</div>
