export default function (eleventyConfig) {
  // Copy assets straight through (Decap uploads live here)
  eleventyConfig.addPassthroughCopy({ "src/assets": "assets" });
  eleventyConfig.addPassthroughCopy({ "src/admin": "admin" });

  // Section collections (auto-list pages under section indexes)
  eleventyConfig.addCollection("om_projektet", (collectionApi) => {
    return collectionApi
      .getFilteredByGlob("src/om-projektet/*.md")
      .filter((item) => item.fileSlug !== "index");
  });

  return {
    dir: { input: "src", includes: "_includes", output: "_site" },
    markdownTemplateEngine: "njk",
    htmlTemplateEngine: "njk",
    templateFormats: ["md", "njk", "html"],
    pathPrefix: "/AiA", // important for project pages
  };
}
