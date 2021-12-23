import { Heading, Page, Button } from "@shopify/polaris";
import axios from 'axios';

function Index(props){
      async function getProductsWithGraphQL(){
        try{
          const res = await axios.post("/api");
          console.log(res);
        }catch(err){
          console.log(err.response.data);
        }
      }
      
      async function getProductsWithRESTAPI(){
        try{
          const res = await axios.post("/api", {
            data: { action: "RESTAPI" }
          });
          console.log(res);
        }catch(err){
          console.log(err.response.data);
        }
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