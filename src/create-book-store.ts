import { UnstructuredLoader } from "@langchain/community/document_loaders/fs/unstructured";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { NeonPostgres } from "@langchain/community/vectorstores/neon";
import { OpenAIEmbeddings } from "@langchain/openai";
import { neon } from "@neondatabase/serverless";

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

  const databaseUrl = Deno.env.get("DATABASE_URL") as string;
  const sql = neon(databaseUrl);
  await sql`DROP TABLE IF EXISTS vectorstore_documents`;

  await NeonPostgres.fromDocuments(
    splits,
    new OpenAIEmbeddings({
      openAIApiKey: Deno.env.get("OPENAI_API_KEY"),
    }),
    { connectionString: databaseUrl },
  );
}

if (import.meta.main) {
  await main();
  Deno.exit(0);
}
