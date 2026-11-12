package uz.jigar.eco;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(JigarScreenPlugin.class); // telefon ekranini Jigarga ko'rsatish (phone-screen.js)
        super.onCreate(savedInstanceState);
    }
}
