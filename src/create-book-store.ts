import { UnstructuredLoader } from "@langchain/community/document_loaders/fs/unstructured";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";

async function main() {
  const loader = new UnstructuredLoader(
    import.meta.dirname + "/../book-pr.md",
    {
      apiKey: Deno.env.get("UNSTRUCTURED_API_KEY"),
      apiUrl: Deno.env.get("UNSTRUCTURED_API_URL"),
    },
  );
  const docs = await loader.load();

  const textSplitter = new RecursiveCharacterTextSplitter({
    chunkSize: 1000,
    chunkOverlap: 200,
  });
  const splits = await textSplitter.splitDocuments(docs);

  await Deno.writeTextFile(
    import.meta.dirname + "/../book-pr-splits.json",
    JSON.stringify(splits),
  );
}

if (import.meta.main) {
  await main();
  Deno.exit(0);
}
