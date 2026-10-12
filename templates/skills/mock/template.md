# mock template

One screen, composed only from `.codeloop/design-system/` blocks. Copy it into a
`<section data-screen="...">` in the mock and replace the content with the story's real content.

```html
<section data-screen="home">
  <h2>home</h2>
  <div class="app-frame">
    <div class="chrome"><span>acme ▾</span><span class="crumb">Home</span><span class="search">Search ⌘K</span></div>
    <div class="app">
      <nav class="nav">
        <span class="item on">Home <span class="count">3</span></span>
        <span class="item">Board</span><span class="item">Plan</span><span class="item">Wiki</span>
      </nav>
      <div class="main">
        <h3 class="title">3 things need you</h3>
        <div class="sub">2 shipped since yesterday · 4 in progress</div>
        <div class="section-label"><span class="pill you">Needs you</span></div>
        <div class="list-row">
          <span class="key">AC-142</span><span class="grow">Export invoices as CSV</span>
          <span class="pill you">Local check</span>
          <span class="proof"><i class="pass"></i><i class="pass"></i><i></i></span>
          <span class="actions"><button class="btn">Open proof</button><button class="btn primary">Approve</button></span>
        </div>
      </div>
    </div>
  </div>
  <p class="note">Proves US1: every gate waiting on the owner is listed with its proof and can be approved here.</p>
</section>
```
