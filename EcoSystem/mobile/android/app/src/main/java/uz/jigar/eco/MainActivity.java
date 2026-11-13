package uz.jigar.eco;

import android.content.Context;
import android.net.Uri;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.CapConfig;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(JigarScreenPlugin.class); // telefon ekranini Jigarga ko'rsatish (phone-screen.js)
        registerPlugin(JigarAgentPlugin.class); // telefon agenti va server manzili (phone-agent.js)
        // Server manzili saqlangan bo'lsa — ilova to'g'ridan-to'g'ri o'sha serverdagi Jigar'ni ochadi;
        // bo'lmasa — ichki sahifa (www/index.html) manzilni so'raydi.
        String server = getSharedPreferences(JigarAgentPlugin.PREFS, Context.MODE_PRIVATE).getString(JigarAgentPlugin.KEY_SERVER, null);
        if (server != null) {
            config = new CapConfig.Builder(this)
                .setServerUrl(server + "/app/")
                .setAllowNavigation(new String[] { Uri.parse(server).getHost() })
                .setAllowMixedContent(true)
                .setErrorPath("index.html") // server ochilmasa — ichki sahifa (manzilni o'zgartirish mumkin)
                .create();
        }
        super.onCreate(savedInstanceState);
    }
}
