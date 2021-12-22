import { Heading, Page, Button } from "@shopify/polaris";


function Index(props){
      async function getProductsWithGraphQL(){
        const res = await props.axios.post("/api", {
          data: {
            action: "GraphQL"
          }
        });
        console.log(res);
      }
      
      async function getProductsWithRESTAPI(){
        const res = await props.axios.post("/api", {
          data: {
            action: "RESTAPI"
          }
        });
        console.log(res);
      }

  
    return (
      <Page>
        <Heading>Shopify app with Node and React </Heading>
        <Button onClick={getProductsWithGraphQL}>Get Products With GraphQL</Button>
        <Button onClick={getProductsWithRESTAPI}>Get Products With REST API</Button>
      </Page>
    );
}

export default Index;