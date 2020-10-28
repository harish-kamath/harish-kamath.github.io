---
layout: page
permalink: /experience/
title: experience
description: Work I've done at some exciting companies.
nav: true
---
<div class="experiences">
<ol class="explist">

  {% assign sorted_experiences = site.experiences | sort: "year" | reverse %}
  {% for exp in sorted_experiences %}
  <li class="exp">
      <div>
      <h4 class="year">{{exp.year_prefix}} {{exp.year}}</h4>
        {% if exp.img %}
        <img src="{{ exp.img | relative_url }}" alt="project thumbnail">
        {% endif %}
        <div class="expinfo">
          {% if exp.redirect %}
            <a href="{{ exp.redirect }}" target="_blank">
          {% else %}
            <a href="{{ exp.url | relative_url }}">
          {% endif %}
          <div class="exptitle">{{ exp.title }}</div>
          <div class="expdesc">{{ exp.description }}</div>
          </a>
        </div>
      </div>

  </li>
{% endfor %}

</ol>
</div>